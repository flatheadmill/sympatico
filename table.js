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

// For the purposes of this implementation I'm going to make a concerted effort
// to banish the hobgoblin of immutability from my mind. We will construct an
// object and then initialize it based on whether we are joining or
// bootstrapping and not pollute the constructor with lies.

class Table {
    constructor (bucketCount) {
        this.queue = new Avenue
        this._bucketCount = bucketCount
        this._participants = {}
        this._table = []
        this._snapshots = []
    }

    join (participants) {
        this._participants = participants
        this._createTable()
    }

    snapshot (promise) {
        return this._snapshots[promise]
    }

    _evenOut (load) {
        const evenedOut = this._bucketCount % Object.keys(this._participants).length == 0 ? 0 : 1
        for (;;) {
            const max = load.max()
            const min = load.min()
            console.log(max.buckets.length, min.buckets.length, evenedOut)
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
        this._table = new Array(this._bucketCount).fill(null)
        for (const promise in this._participants) {
            const participant = this._participants[promise]
            for (const index of participant.buckets) {
                assert(this._table[index] == null)
                this._table[index] = participant.promise
            }
        }
    }

    arrive (promise, properties) {
        const size = Object.keys(this._participants).length + 1
        if (size == 1) {
            this._participants[promise] = {
                promise: promise,
                buckets: new Array(this._bucketCount).fill(0).map((_, index) => index),
                properties: properties
            }
        } else {
            this._snapshots[promise] = JSON.parse(JSON.stringify(this._participants))
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
        this._createTable()
        this.queue.push(JSON.parse(JSON.stringify(this._table)))
    }

    acclimate (promise) {
        delete this._snapshots[promise]
    }

    depart (promise, address) {
        delete this._snapshots[promise]
        const participant = this._participants[promise]
        delete this._participants[promise]
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
        this._createTable()
        this.queue.push(this._table)
    }
}

module.exports = Table
