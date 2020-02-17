const assert = require('assert')

const coalesce = require('extant')
const fnv = require('./fnv')
const Keyify = require('keyify')

const Paxos = require('./paxos')

class Router {
    constructor (destructible, { extractor, hash, transport, buckets, address }) {
        this.address = address
        this.buckets = []
        this.shifters = []
        this._hash = coalesce(hash, fnv)
        this._extractor = extractor
        this._transport = transport
        this._pause = []
        for (let i = 0; i < buckets; i++) {
            const paxos = new Paxos(destructible.durable([ 'paxos', i ]), transport, this, i)
            this.shifters.push(paxos.log.shifter().sync)
            this.buckets.push(paxos)
        }
    }

    outboxes () {
        return this.buckets.map(paxos => paxos.outbox.shifter())
    }

    entries () {
        return this.buckets.map(paxos => paxos.log)
    }

    snapshots () {
        return this.buckets.map(paxos => paxos.snapshot)
    }

    bootstrap (now, table) {
        assert.equal(table.length, this.buckets.length, 'bucket count wrong')
        this.ordered = [ this.address ]
        this.table = table
        this.buckets.forEach((paxos, index) => paxos.bootstrap())
    }

    join (ordered, table) {
        this.ordered = ordered
        this.table = table
        this.buckets.forEach((paxos, index) => paxos.join())
    }

    arrive (identifier, order, table) {
        switch (order.length) {
        case 1:
            break
        case 2:
            this.table.forEach((_, index) => {
                const pause = this._pause[index] = {}
                pause.promise = new Promise(resolve => pause.resolve = resolve)
            })
            const majorities = table
                .map((value, index) => [ index, [ value, order[(order.indexOf(value) + 1) % 2] ] ])
                .filter((_, index) => this.table[index] == this.address)
            for (const majority of majorities) {
                this.buckets[majority[0]].arrive(identifier, majority[1])
            }
            break
        default:
        }
    }

    route (machines, table) {
    }

    _bucket (value) {
        return this._hash.call(null, this._extractor.call(null, value)) % this.table.length
    }

    snapshotted (bucket, identifier) {
        this.buckets[bucket].snapshotted(identifier)
    }

    // When a bucket abdicates, we need to ensure that its message queue is sent
    // before any other messages are queued. Stream submissions can come in
    // parallel because each stream will send one at a time, but if we allow our
    // backlog forward to occur in parallel with new submissions we are racing
    // enqueued submissions with a possible new submission.

    // This suggests a queue for the hop, where there is only one connection
    // between each participant for enqueue, or alternatively some way to pause
    // the hops and using the Paxos channel to send the enqueue.

    // We only have to check the pause if we are in the process of transitioning
    // a government though.
    async enqueue (value) {
        const bucket = this._bucket(value)
        const address = this.table[bucket]
        const paxos = this.buckets[bucket]
        if (paxos.government.majority[0] == this.address) {
            if (address != this.address) {
                await paxos.pause.allowed('0/0')
            }
            paxos.enqueue(value)
        } else {
            if (address == this.address) {
                paxos.enqueue(value)
            } else {
                await this._transport.enqueue(address, value)
            }
            if (paxos.government.majority[0] == this.address) {
                paxos.enqueue(value)
            } else {
                await this._transport.enqueue(paxos.government.majority[0], value)
            }
        }
    }

    receive (bucket, messages) {
        const paxos = this.buckets[bucket]
        return paxos.receive(messages)
    }
}

module.exports = Router
