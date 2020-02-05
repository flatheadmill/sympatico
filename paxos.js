// TODO Going to need syncrhonization, yeah, so we can push snapshots one at a
// time, and then have them join with a sync.
//
// Going to keep it simple. Rather than streaming, sending one message at a
// time, including the snapshot. It will be one chunk of JSON at time.
// Synchronization will be one commit at a time. Saves having to think too hard
// about the networking. Will slow down joins, but speed up development.
const assert = require('assert')

const Avenue = require('avenue')
const Monotonic = require('paxos/monotonic')

class Paxos {
    constructor (address, bucket) {
        this.address = address
        this.bucket = bucket
        this.id = ([ address, bucket ]).join('/')
        this.government = {
            promise: '0/0',
            majority: []
        }
        this.log = new Avenue().sync
        this.outbox = new Avenue().sync
        this._tail = this.log.shifter().sync
        this.pinged = new Avenue().sync
        this._writes = []
    }

    bootstrap (now, address, properties) {
        this.government = {
            promise: '1/0',
            majority: [ address ],
            minority: [],
            constituents: [],
            acclimate: address,
            arrive: { id: this.id, properties: properties, cookie: 0 },
            arrived: { promise: {}, id: {} }
        }
        this._top = '0/0'
        this.promise = '1/0'
        this.government.arrived.promise[address] = '1/0'
        this.government.arrived.id['1/0'] = address
        this.log.push({ isGovernment: true, promise: '1/0', body: this.government })
    }

    _send () {
        this.outbox.push({
            to: this.government.majority.slice(),
            bucket: this.bucket,
            messages: this._writes.shift(),
            responses: {}
        })
    }

    _nudge () {
        if (!this._writing) {
            this._writing = true
            this._send()
        }
    }

    transform (now, majority) {
        let map = null
        if (this._writes.length && this._writes[0].isGovernment) {
            const mapped = this._writes.shift().government.map
            for (const was of mapped) {
                map[mapped[was]] = was
            }
        }
        majority = majority.concat(this.majority)
        majority = majority.filter((id, index) => majority.indexOf(id) == index)
        const government = JSON.parse(JSON.stringify(this.government))
        government.majority = majority
        government.promise = Monotonic.increment(government.promise, 0)
        government.map = {}
        let promise = government.promise
        for (const write in this._writes) {
            promise = Monotonic.increment(promise, 1)
            government.map[map[write.promise] || write.promise] = promise
        }
        this._writes.unshift({ isGovernment: true, map, promise, body: government })
        this._nudge()
    }

    join () {
    }

    receive (messages) {
        for (const message of messages) {
            switch (message.method) {
            case 'write':
                console.log('>>>', message)
                this._write = message
                return true
            case 'commit':
                console.log('commit >>>', message, this._write)
                const write = this._write
                this._write = null
                this._commit(0, write, this._top)
                return true
            }
        }
    }

    enqueue (now, body) {
        const promise = this.promise = Monotonic.increment(this.promise, 1)
        this._writes.push([{ method: 'write', promise, isGovernment: false, body }])
        this._nudge()
    }

    _findRound = function (sought) {
        const shifter = this._tail.shifter().sync
        while (shifter.peek().promise != sought) {
            shifter.shift()
        }
        return shifter
    }

    _commit (now, entry, top) {
        console.log(entry)
        const isGovernment = Monotonic.isGovernment(entry.promise)

        if (Monotonic.compare(entry.promise, top) <= 0) {
            const shifter = this._findRound(entry.promise)
            assert.deepStrictEqual(shifter.shift().body, entry.body)
        }

        if (isGovernment) {
            assert(Monotonic.compare(this.government.promise, entry.promise) < 0, 'governments out of order')
            this.government.promise = entry.promise
            this.government.majority = entry.body.majority
            if (entry.body.arrive != null) {
                if (entry.promise == '1/0') {
                    this.government.majority.push(entry.body.arrive.id)
                }
            }
        } else {
            console.log('else', entry)
            this._top = entry.promise
            this.log.push({
                promise: entry.promise,
                isGovernment: false,
                body: entry.body
            })
        }
    }

    sent (envelope) {
        if (envelope.to.reduce((success, to) => envelope.responses[to], true)) {
            const messages = []
            for (const message of envelope.messages) {
                if (message.method == 'write') {
                    messages.push({
                        to: envelope.to,
                        bucket: envelope.bucket,
                        message: {
                            method: 'commit',
                            promise: message.promise
                        }
                    })
                    if (this._writes.length == 0) {
                        this._writes.push([{ method: 'commit', promise: message.promise }])
                    } else {
                        while (messages.length != 0) {
                            this._writes[0].messages.unshift(messages.pop())
                        }
                    }
                }
            }
            if (this._writes.length != 0) {
                this._send()
            } else {
                this._writing = false
            }
        } else {
            throw new Error
        }
    }
}

module.exports = Paxos
