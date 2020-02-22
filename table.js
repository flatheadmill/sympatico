const assert = require('assert')

const RBTree = require('bintrees').RBTree
const Monotonic = require('paxos/monotonic')
const Avenue = require('avenue')

function sortByLoad (left, right) {
    const compare = left.buckets.length - right.buckets.length
    if (compare == 0) {
        return Monotonic.compare(left.promise, right.promise)
    }
    return compare
}


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
        this.queue = new Avenue
        this._bucketCount = bucketCount
        this._participants = {}
        this._order = []
        this._table = []
        this._tables = []
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

    _evenOut (load) {
        const evenedOut = this._bucketCount % Object.keys(this._participants).length == 0 ? 0 : 1
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

    arrive (promise, properties) {
        const size = Object.keys(this._participants).length + 1
        if (size == 1) {
            this._order.push(promise)
            this._participants[promise] = {
                promise: promise,
                buckets: new Array(this._bucketCount).fill(0).map((_, index) => index),
                properties: properties
            }
        } else {
            this._snapshots[promise] = JSON.parse(JSON.stringify({
                participants: this._participants,
                order: this._order
            }))
            this._order.push(promise)
            const load = new RBTree(sortByLoad)
            for (const promise in this._participants) {
                load.insert(this._participants[promise])
            }
            const participant = this._participants[promise] = {
                promise: promise,
                buckets: [],
                properties: properties
            }
            let buckets =  Math.floor(this._bucketCount / size)
            while (buckets-- != 0) {
                const max = load.max()
                load.remove(max)
                const index = max.buckets.shift()
                load.insert(max)
                participant.buckets.push(index)
            }
            this._evenOut(load)
        }
        this._table = this._createTable()
        this.queue.push(JSON.parse(JSON.stringify(this._table)))
    }

    acclimate (promise) {
        delete this._snapshots[promise]
    }

    depart (promise, address) {
        delete this._snapshots[promise]
        const participant = this._participants[promise]
        delete this._participants[promise]
        this._order.splice(this._order.indexOf(promise), 1)
        const table = JSON.parse(JSON.stringify(this._table))
        for (const bucket of table) {
            const index = bucket.indexOf(promise)
            if (~index) {
                bucket.splice(index, 1)
            }
            assert(bucket.length != 0)
        }
        const load = new RBTree(sortByLoad)
        for (const promise in this._participants) {
            load.insert(this._participants[promise])
        }
        while (participant.buckets.length != 0) {
            const index = participant.buckets.shift()
            const min = load.min()
            min.buckets.push(index)
            load.remove(min)
            load.insert(min)
        }
        this._evenOut(load)
        this._tables.push(this._createTable())
        this.queue.push(table)
    }
}

module.exports = Table
