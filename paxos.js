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

function okay (addresses) {
    const responses = {}
    for (const to of addresses) {
        responses[to] = true
    }
    return responses
}

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
        this._top = '1/0'
        this.promise = '1/0'
        this.government.arrived.promise[address] = '1/0'
        this.government.arrived.id['1/0'] = address
        this.log.push({ isGovernment: true, promise: '1/0', body: this.government })
    }

    join (address, properties) {
        this._top = '0/0'
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

    // Need to use the hegemonic promise as some sort of veto, I'll bet. Keep the
    // internal promise separate because I've just adopted this transitional
    // government scheme. We'll call the hegemonic promise the identifier.
    arrive (identifier, majority) {
        const promise = this._top
        const tails = {}
        for (const arrival of diff) {
            tails[arrival] = this._tail.shifter().sync
            while (tail.peek() != promise) {
                tail.shift()
            }
        }
        this._arrival = { identifier, diff, promise, tails, snapshot: null }
        this.arrivals.push({ promise, majority })
        this.log.push({ method: 'snapshot', promise })
    }

    // Note that for surge replace we're going to do things at the router level.
    // Our majority will be shaped such that the delegates are not on the left
    // or right of the new leader, but remain in the place of the old leader.
    // We'll move to the new leader. Then we can mark the old leader as gone. In
    // doing so we don't have to do a depart because there not be a Paxos
    // running on that old leader.

    // Basically, I get to think about how to to rebalance outside of this
    // class. This class is unaware of our left-right neighbor concept.
    depart (identifier, majority) {
        // Here we would delete the snapshot preventing any further
        // synchronization, we might have a synchronization in flight.

        // We have to consider the race conditions. In our half-Paxos, are we in
        // the middle of some sort of government transition? Is it going to
        // fail? It means we can't goof around with synchronize, though. We have
        // to be certain we've completed our synchronization before we
        // transition the government.

    }

    // Okay. So you tell the old leader to go ahead and push the new government
    // to the new leader, even if the old leader will not be a member of the new
    // government.
    //
    // So the router can keep a queue of new governments. We won't short circuit
    // for now a new arrival, but instead work through all the government
    // changes as we grow the cluster.
    //
    // What if when we put in our acclimate message, when it counts down, in the
    // router we will know that we can skip any tables that are currently
    // queued, just pop the last one, the last table, and clear the queue. We'll
    // know that everyone has the same list of tables.
    //
    // But, we don't abort the creation of a government. Too annoying.
    _newGovernment (majority) {
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

    // Kick off the snapshot transfer with a bogus first response which will
    // start an asynchronous loop to send json chunks one at a time.
    snapshot (promise, snapshot) {
        if (this._snapshot != null && this._snapshot.promise == promise) {
            this._snapshot.shifter = snapshot.shifter()
            this._send({
                to: diff,
                bucket: this.bucket,
                messages: [{ method: 'snapshot', promise, body: true }],
                responses: okay(diff)
            })
        }
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
                } else if (message.method == 'government') {
                } else if (this._snapshot != null && this._snapshot.promise == message.promise) {
                    switch (message.method) {
                    case 'snapshot':
                        if (message.body == null) {
                            this._send({
                                to: envelope.to,
                                bucket: envelope.bucket,
                                messages: [{ method: 'synchronize', promise: message.promise }],
                                response: okay(envelope.to)
                            })
                        } else {
                            const body = this._snapshot.shifter.shift()
                            this.outbox.push({
                                to: envelope.to,
                                bucket: envelope.bucket,
                                messages: [{
                                    method: 'snapshot',
                                    promise: message.promise,
                                    body: this._snapshot.shifter.shift()
                                }],
                                responses: {}
                            })
                        }
                        break
                    case 'synchronize':
                        const messages = []
                        for (const entry of this._snapshot.tails[this._snapshot.promise].splice(32)) {
                            messages.push({
                                method: 'write', ...entry
                            }, {
                                method: 'commit', promise: entry.promise
                            })
                        }
                        // We've caught up, more or less, so let's change our
                        // government. We change to a government where we are
                        // still the leader, but we are waiting for all the
                        // participants to acclimate, so we're going to be the
                        // leader and update members of both governments.
                        if (messages.length < 32) {
                            const snapshot = this._snapshot
                            this._snapshot = null
                            const government = newGovernent(this._snapshot.minority)
                        } else {
                            this.outbox.push({
                                to: envelope.to,
                                bucket: envelope.bucket,
                                messages: messages
                            })
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
