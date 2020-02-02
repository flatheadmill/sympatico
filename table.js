const RBTree = require('bintrees').RBTree
const Monotonic = require('paxos/monotonic')

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
        this._bucketCount = bucketCount
        this._participants = {}
        this._table = []
    }

    join (participants) {
        this._participants = participants
        this._createTable()
    }

    snapshot () {
        return JSON.parse(JSON.stringify(this._participants))
    }

    _createTable () {
        this._table = new Array(this._bucketCount).fill(null)
        for (const identifier in this._byIdentifier) {
            for (const index of participant.buckets) {
                assert(this._table[index] == null)
                this._table[index] = participant.promise
            }
        }
    }

    arrive (identifier, properties) {
        const size = Object.keys(this._participants).length + 1
        if (size == 1) {
            this._participant[identifer] = {
                buckets: new Array(this._bucketCount).fill(0).map((_, index) => index),
                properties: properties
            }
        } else {
            const load = new RBTree(sortByLoad)
            for (const promise in this._participant) {
                load.insert(this._participants[promise])
            }
            const participant = this._participants[identifer] = {
                buckets: [],
                address: address
            }
            let buckets =  Math.floor(this._bucketCount / size)
            while (buckets-- != 0) {
                const max = load.remove(this._byBucketCount.max())
                const index = max.buckets.shift()
                load.insert(max)
                participant.buckets.push(index)
            }
        }
    }

    depart (identifer, address) {
        const load = new RBTree(sortByLoad)
        for (const promise in this._participant) {
            load.insert(this._participants[promise])
        }
        const participant = this._participants[promise]
        this._participants.splice(this._participants.indexOf(participant), 1)
        let index = 0
        while (participant.buckets.length != 0) {
            const transfer = this._participants[index++ % this._participants.length]
            transfer.push(participant.buckets.shift())
        }
        this._createTable()
    }
}

module.exports = Table
