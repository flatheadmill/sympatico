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
            console.log(this.table)
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

    _leader (value) {
        return this._hash.call(null, this._extractor.call(null, value)) % this.table.length
    }

    hopped (now, value) {
        const paxos = this.buckets[this._leader(value)]
        paxos.enqueue(now, value)
    }

    snapshotted (bucket, identifier) {
        this.buckets[bucket].snapshotted(identifier)
    }

    enqueue (now, value) {
        const leader = this.table[this._leader(value)]
        if (leader == this.address) {
            this.hopped(now, value)
        } else {
        }
    }

    receive (bucket, messages) {
        const paxos = this.buckets[bucket]
        return paxos.receive(messages)
    }
}

module.exports = Router
