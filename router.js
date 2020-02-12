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
        for (let i = 0; i < buckets; i++) {
            const paxos = new Paxos(destructible.durable([ 'paxos', i ]), transport, address, i)
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

    async enqueue (value) {
        const bucket = this._bucket(value)
        const address = this.table[bucket]
        if (address == this.address) {
            this.buckets[bucket].enqueue(value)
        } else {
            await this._transport.enqueue(address, value)
        }
    }

    receive (bucket, messages) {
        const paxos = this.buckets[bucket]
        return paxos.receive(messages)
    }
}

module.exports = Router
