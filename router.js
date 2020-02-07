const assert = require('assert')

const fnv = require('hash.fnv')
const Keyify = require('keyify')

const Paxos = require('./paxos')

class Router {
    constructor (extractor, bucketCount, address) {
        this.address = address
        this.buckets = []
        this.shifters = []
        this.extractor = extractor
        for (let i = 0; i < bucketCount; i++) {
            const paxos = new Paxos(address, i)
            this.shifters.push(paxos.log.shifter().sync)
            this.buckets.push(paxos)
        }
    }

    outboxes () {
        return this.buckets.map(paxos => paxos.outbox.shifter())
    }

    entries () {
        return this.buckets.map(paxos => paxos.log.shifter())
    }

    bootstrap (now, table) {
        assert.equal(table.length, this.buckets.length, 'bucket count wrong')
        this.ordered = [ this.address ]
        this.table = table
        this.buckets.forEach((paxos, index) => paxos.bootstrap(now, ([ this.address, index ]).join('/'), {}))
    }

    arrive (table) {
    }

    route (machines, table) {
    }

    _leader (value) {
        const buffer = Buffer.from(Keyify.stringify(value))
        const hash = fnv(0, buffer, 0, buffer.length)
        return hash % this.table.length
    }

    hopped (now, value) {
        const paxos = this.buckets[this._leader(value)]
        paxos.enqueue(now, value)
    }

    enqueue (now, value) {
        const key = this.extractor.call(null, value)
        const leader = this.table[this._leader(value)]
        console.log(leader)
        if (leader == this.address) {
            this.hopped(now, value)
        } else {
        }
    }

    receive (bucket, messages) {
        const paxos = this.buckets[bucket]
        console.log(bucket, messages)
        return paxos.receive(messages)
    }

    sent (envelope) {
        this.buckets[envelope.bucket].sent(envelope)
    }
}

module.exports = Router
