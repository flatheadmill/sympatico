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
const events = require('events')

class Paxos extends events.EventEmitter {
    constructor (destructible, transport, address, bucket) {
        super()
        this.address = address
        this.bucket = bucket
        this.government = {
            promise: '0/0',
            majority: []
        }
        this.log = new Avenue()
        this.snapshot = new Avenue()
        this.outbox = new Avenue()
        this._tail = this.log.shifter().sync
        this.pinged = new Avenue()
        this.destroyed = false
        this._writes = [ [] ]
        this._transport = transport
        destructible.durable('paxos', this._send.bind(this))
        destructible.destruct(() => {
            this.destroyed = true
            transport.notify('send', address, bucket)
        })
    }

    bootstrap () {
        this.government = {
            promise: '1/0',
            majority: [ this.address ],
            minority: [],
            constituents: [],
            acclimate: this.address,
            arrive: { id: this.address, properties: {}, cookie: 0 },
            arrived: { promise: {}, id: {} }
        }
        this._top = '1/0'
        this.promise = '1/0'
        this.government.arrived.promise[this.address] = '1/0'
        this.government.arrived.id['1/0'] = this.address
        this.log.push({ isGovernment: true, promise: '1/0', body: this.government })
    }

    join () {
        this._top = '0/0'
    }


    // Need to use the hegemonic promise as some sort of veto, I'll bet. Keep the
    // internal promise separate because I've just adopted this transitional
    // government scheme. We'll call the hegemonic promise the identifier.
    arrive (identifier, majority) {
        const promise = this._top
        const diff = majority.filter(address => !this.government.majority.includes(address))
        const tail = this._tail.shifter().sync
        while (tail.peek().promise != promise) {
            assert(tail.peek())
            tail.shift()
        }
        tail.shift()
        this._arrival = { identifier, diff, promise, tail, snapshot: null }
        this.snapshot.push({ method: 'snapshot', to: diff, bucket: this.bucket, promise })
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

    receive (messages) {
        for (const message of messages) {
            switch (message.method) {
            case 'write':
                this._write = message
                break
            case 'commit':
                const write = this._write
                this._write = null
                this._commit(0, write, this._top)
                break
            default:
                throw new Error(message.method)
            }
        }
        return true
    }

    enqueue (now, body) {
        const promise = this.promise = Monotonic.increment(this.promise, 1)
        this._writes[this._writes.length - 1].push({
            messages: [{ method: 'write', promise, isGovernment: false, body }]
        })
        this._transport.notify('send', this.address, this.bucket)
    }

    async snapshotted (identifier) {
        for (const splice of this._arrival.tail.iterator(32)) {
            const messages = splice.reduce((messages, entry) => {
                return messages.concat({
                    method: 'write', ...entry
                }, {
                    method: 'commit', promise: entry.promise
                })
            }, [])
            if (splice.length < 32) {
                if (this._write != null) {
                    messages.push(this._write)
                }
                this._writes.unshift([{
                    to: this._arrival.diff,
                    bucke: this.bucket,
                    messages: messages
                }])
                this._transport.notify('send', this.address, this.bucket)
                break
            }
            await this._transport.send({
                to: this._arrival.diff,
                bucket: this.bucket,
                messages: messages
            })
        }
    }

    _commit (now, entry, top) {
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
            this._top = entry.promise
            this.log.push({
                promise: entry.promise,
                isGovernment: false,
                body: entry.body
            })
        }
    }

    async _send () {
        while (!this.destroyed) {
            if (this._writes[0].length == 0 && this._writes.length != 1) {
                this._writes.shift()
            }
            if (this._writes[0].length == 0) {
                await this._transport.wait('send', this.address, this.bucket)
                continue
            }
            const write = this._writes[0].shift()
            const envelope = {
                to: write.to || this.government.majority.slice(),
                bucket: this.bucket,
                messages: write.messages
            }
            const leader = envelope.to.indexOf(this.address)
            if (~leader) {
                assert.equal(leader, 0, 'leader is not first in majority')
                envelope.to.shift()
                this.receive(envelope.messages)
            }
            // Hmm... The `responses` map isn't making much senese anymore.
            // Maybe throw an exception? Or just return false? Oh, no. Someone
            // you speak with might be ahead of you, so it would return a
            // rejection, and that is not an exceptional condition, really.
            const responses = await this._transport.send(envelope)
            if (~leader) {
                const messages = []
                for (const message of envelope.messages) {
                    if (message.method == 'write') {
                        const commit = { method: 'commit', promise: message.promise }
                        if (this._writes[this._writes.length - 1].length == 0) {
                            this._writes[this._writes.length - 1].push({ messages: [ commit ] })
                        } else {
                            this._writes[this._writes.length - 1].messages.unshift(commit)
                        }
                    }
                }
            }
            if (this._writes.length != 0) {
                this._transport.notify('send', this.address, this.bucket)
            }
        }
    }
}

module.exports = Paxos
