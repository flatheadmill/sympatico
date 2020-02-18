const assert = require('assert')
const events = require('events')
const dump = require('./dump')

const coalesce = require('extant')
const fnv = require('./fnv')
const Keyify = require('keyify')

const Queue = require('avenue')

const Paxos = require('./paxos')

class Router extends events.EventEmitter {
    constructor (destructible, { extractor, hash, transport, buckets, address }) {
        super()
        this.address = address
        this.buckets = []
        this.shifters = []
        this.transitions = new Queue
        this._countdowns = {}
        this._hash = coalesce(hash, fnv)
        this._extractor = extractor
        this._transport = transport
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

    // Note that when we count down we might not wait for a finalization on our
    // side knowing that the next state of the transition will be held back by
    // the finalization on the other side. Specifically, we're done with an
    // abdication when the new government is committed even though we still have
    // to fowrard the backlog, but we're done with a coronation only when the
    // backlog is received.
    arrive (identifier, order, table) {
        switch (order.length) {
        case 2:
            const majorities = table
                .map((value, index) => [ index, [ value, order[(order.indexOf(value) + 1) % 2] ] ])
            // Current leadership transitioning to growth or abdication.
            const mutations = majorities.filter((next, index) => {
                const previous = this.buckets[index].government.majority
                return this.table[index] == this.address &&
                    (
                        next.length != previous.length ||
                        next.map((address, index) => previous[index] == address).length != next.length
                    )

            })
            for (const mutation of mutations) {
                this.buckets[mutation[0]].arrive(identifier, mutation[1])
            }
            const coronations = majorities.filter((majority, index) => {
                return majority[1][0] == this.address &&
                       this.table[index] != this.address
            })
            // Increment our transfer countdown once for each new government.
            this.increment(identifier, 'transfer', coronations.length)
            const governments = majorities.filter((next, index) => {
                const previous = this.buckets[index].government.majority
                return (~next.indexOf(this.address) || ~previous.indexOf(this.address)) ||
                    (
                        next.length != previous.length ||
                        next.map((address, index) => previous[index] == address).length != next.length
                    )
            })
            // Increment our transfer countdown once for each unpause.
            this.increment(identifier, 'transfer', governments.length)
            this._identifier = identifier
            this._arrival = { identifier, majorities }
            break
        default:
        }
        // Possibly trigger the transfer if we've reached zero by virtue of
        // being on the receiving end of the actions of other participants.
        this.increment(identifier, 'transfer')
        this.decrement(identifier, 'transfer')
    }

    transition () {
        assert(this._arrival)
        const transitions = this._arrival.majorities.filter(majority => majority[1][0] == this.address)
        dump({ address: this.address, arrival: this._arrival, transitions })
        for (const transition of transitions) {
            this.increment(this._arrival.identifier, 'transfer')
            this.buckets[transition[0]].transition(this._arrival.identifier, transition[1])
        }
        this.increment(this._arrival.identifier, 'transfer')
        this.decrement(this._arrival.identifier, 'transfer')
    }

    _countdown (identifier) {
        if (!(identifier in this._countdowns)) {
            this._countdowns[identifier] = { transfer: 0, complete: 0 }
        }
    }

    decrement (identifier, stage) {
        this._countdown(identifier)
        this._countdowns[identifier][stage]--
        if (this._countdowns[identifier][stage] == 0) {
            this.transitions.push({ stage, identifier })
        }
    }

    increment (identifier, stage, amount = 1) {
        this._countdown(identifier)
        this._countdowns[identifier][stage] += amount
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
