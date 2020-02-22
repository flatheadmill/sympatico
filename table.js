const assert = require('assert')

const RBTree = require('bintrees').RBTree
const Monotonic = require('paxos/monotonic')
const Queue = require('avenue')

// Appears that we use our map of particpants and the buckets assigned to them
// as the definitive, latest table and just keep track of whether that has
// drifted from the table that is out there getting sorted by the participants.
//
// But, somehow I know that having an array of tables is easier to track will
// make it easier to page this code into programmer memory when I return to it,
// so there will be a `_tables` array that we'll `pop()` from.

// For the purposes of this implementation I'm going to make a concerted effort
// to banish the hobgoblin of immutability from my mind. We will construct an
// object and then initialize it based on whether we are joining or
// bootstrapping and not pollute the constructor with lies.

class Table {
    constructor (bucketCount) {
        this.queue = new Queue
        this._bucketCount = bucketCount
        this._participants = {}
        this._order = []
        this._table = []
        this._arrivals = []
        this._snapshots = []
    }

    join (snapshot) {
        this._participants = snapshot.participants
        this._order = snapshot.order
        this.table = this._createTable()
    }

    snapshot (promise) {
        return this._snapshots[promise]
    }

    _evenOuter () {
        const load = new RBTree(function (left, right) {
            const compare = left.buckets.length - right.buckets.length
            if (compare == 0) {
                return Monotonic.compare(left.promise, right.promise)
            }
            return compare
        })
        for (const promise in this._participants) {
            load.insert(this._participants[promise])
        }
        return load
    }

    _createTable () {
        const table = new Array(this._bucketCount).fill(null), order = this._order
        for (const promise in this._participants) {
            const participant = this._participants[promise]
            for (const index of participant.buckets) {
                assert(table[index] == null)
                table[index] = participant.promise
            }
        }
        switch (order.length) {
            case 1:
                return table.map(value => [ value ])
            case 2:
                return table.map(value => [ value, order[(order.indexOf(value) + 1) % 2] ])
            default:
                return table.map(value => {
                    const index = order.indexOf(value)
                    const left = order[(order.length + (index - 1) % order.length) % order.length]
                    const right = order[(index + 1) % order.length]
                    return [ value, left, right ]
                })
        }
    }

    _nextTable () {
        const size = this._order.length
        this._order.push.apply(this._order, this._arrivals)
        if (size == 0) {
            const promise = this._arrivals.shift()
            this._participants[promise] = {
                promise: promise,
                buckets: new Array(this._bucketCount).fill(0).map((_, index) => index)
            }
            this._table = this._createTable()
        } else {
            for (const promise of this._arrivals) {
                this._participants[promise] = { promise, buckets: [] }
            }
            const load = this._evenOuter()
            const evenedOut = this._bucketCount % this._order.length == 0 ? 0 : 1
            for (;;) {
                const max = load.max()
                const min = load.min()
                if (max.buckets.length - min.buckets.length == evenedOut) {
                    break
                }
                load.remove(max)
                load.remove(min)
                min.buckets.push(max.buckets.shift())
                load.insert(max)
                load.insert(min)
            }
        }
        this._pending = {
            departed: false,
            table: this._createTable(),
            arrivals: this._arrivals.splice(0)
        }
        this.queue.push(this._pending.table)
    }

    _maybeNextTable () {
        if (this._arrivals.length != 0 && this._pending == null) {
            this._nextTable()
        }
    }

    arrive (promise) {
        this._snapshots[promise] = JSON.parse(JSON.stringify({
            participants: this._participants,
            order: this._order,
            arrivals: this._arrivals
        }))
        this._arrivals.push(promise)
        this._maybeNextTable()
    }

    acclimate (promise) {
        delete this._snapshots[promise]
    }

    depart (promise) {
        delete this._snapshots[promise]
        const participant = this._participants[promise]
        delete this._participants[promise]
        this._order.splice(this._order.indexOf(promise), 1)
        const table = JSON.parse(JSON.stringify(this._table))
        if (this._pending != null) {
            this._arrivals.unshift.apply(this._arrivals, this._pending.arrivals)
        }
        this._pending = { departed: true }
        const load = this._evenOuter()
        for (let i = 0, I = table.length; i < I; i++) {
            const bucket = table[i]
            const index = bucket.indexOf(promise)
            if (~index) {
                bucket.splice(index, 1)
                if (index == 0) {
                    if (bucket.length == 0) {
                        const min = load.min()
                        load.remove(min)
                        bucket.push(min.promise)
                        min.buckets.push(i)
                        load.insert(min)
                    } else {
                        const participant = this._participants[bucket[0]]
                        load.remove(participant)
                        participant.buckets.push(i)
                        load.insert(participant)
                    }
                }
            }
        }
        this._departed = true
        this.queue.push(this._table = table)
    }

    // If this is a departure table, we've already promoted it, but if not we
    // can now fail forward on depature using the new table.

    //
    transition () {
        if (!this._pending.departed) {
            this._table = this._pending.table
        }
    }

    // If we've departed, we do go to the next table which will even out the
    // leadership, otherwise we'll go to the next table if there are arrivals.

    //
    complete () {
        if (this._pending.departed) {
            this._nextTable()
        } else {
            this._pending = null
            this._maybeNextTable()
        }
    }
}

module.exports = Table
