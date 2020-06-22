// Node.js API.
const assert = require('assert')

// Red-black tree for ordered maps.
const RBTree = require('bintrees').RBTree

// Ever incrementing namespaced identifiers.
const Monotonic = require('paxos/monotonic')

// An evented queue.
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

//
class Table {
    // Construct a new table with `bucketCount` buckets.

    // Participants are idnetified by the Paxos promise that announced their
    // arrival. The Paxos promise will be unique and ever increasing identifier.

    // `_participants` contains the arrival promise and an array of bucket
    // indicies. The indicies are not sorted. We use the bucket index array to
    // distrubute the buckets, then build a table by visiting the bucket index
    // arrays of each participant.

    // `_order` simply organizes the promises by the order in which they arrived
    // so we have an order that will determine the left and right siblings of
    // participant and that will be the consensus for the bucket.

    // `_arrivals` is a place to stack promises of arrivals in arrival until a
    // new table can be built.

    //
    constructor (bucketCount) {
        // An output queue of generated tables.
        this.queue = new Queue
        // Count of buckets.
        this._bucketCount = bucketCount
        // Map of participants by the Paxos promise when the arrived.
        this._participants = {}
        // Array of Paxos promises indicating order of participant arrival.
        this._order = []
        // Most recently transitioned to table for snapshotting.
        this._table = []
        // An array of promises indicating pending arrivals in arrival order.
        this._arrivals = []
        // A map of snapshots keyed by promise when the snapshot was taken.
        this._snapshots = {}
    }

    //

    // Initialize the state of this table manager with the given table.
    join (snapshot) {
        this._participants = snapshot.participants
        this._order = snapshot.order
        this._table = this._createTable()
    }

    //

    // Return the snapshot recorded for the given arrival.
    snapshot (promise) {
        return this._snapshots[promise]
    }

    //

    // Creates a red-black tree that is ordered by the number of buckets
    // associated with a participant. This tree is used to redistribute buckets
    // during arrival and departure.
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

    //

    // Create a table from the current bucket distrubtion in `_participants`.

    //
    _createTable () {
        // Create an array of bucket count and fill it with the participant
        // promises based on indices in the bucket index array of each
        // participant.
        const table = new Array(this._bucketCount).fill(null), order = this._order
        for (const promise in this._participants) {
            const participant = this._participants[promise]
            for (const index of participant.buckets) {
                assert(table[index] == null)
                table[index] = participant.promise
            }
        }
        // Convert the array of participant promises into an array of
        // consensuses &mdash; an array of participant promises participating in
        // a consensus for the bucket where the first participant promise
        // indicates the leader.
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

    //

    // Distribute buckets to newly arrived participants.
    _redistrubute () {
        const size = this._order.length
        this._order.push.apply(this._order, this._arrivals)
        // If size is zero, then this is a bootstrap. We're creating the first
        // table for the first participant. If we're pushing all the
        // arrivals aren't we able to have an initial size that is greater than
        // one? Seems like it is not possible since the initial arrival will
        // trigger the immediate, synchronous creation of the initial table.
        //
        // Otherwise, we need to redistribute the buckets to the new members.
        if (size == 0) {
            const promise = this._arrivals.shift()
            this._participants[promise] = {
                promise: promise,
                buckets: new Array(this._bucketCount).fill(0).map((_, index) => index)
            }
            this._table = this._createTable()
        } else {
            // Create new entries in the participants table for each newly
            // arrived participant.
            for (const promise of this._arrivals) {
                this._participants[promise] = { promise, buckets: [] }
            }
            // Even out the load by assigning buckets to the new participants.
            // Determine if we can be perfectly evened out, and then move buckes
            // from max to min until we're as even as we can be.
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
        // We now have a pending table. It becomes the active table when
        // `Table.transition()` is called.
        this._pending = {
            departed: false,
            table: this._createTable(),
            arrivals: this._arrivals.splice(0)
        }
        // Inform observers of the new table.
        this.queue.push(this._pending.table)
    }

    //

    // Only create a new table if the previous table has completed it's
    // transition.
    _maybeNextTable () {
        if (this._arrivals.length != 0 && this._pending == null) {
            this._redistrubute()
        }
    }

    //

    // On arrival, take a snapshot, push our arrivals onto a queue of
    // arrivals, then maybe create a new table if none is pending.
    arrive (promise) {
        this._snapshots[promise] = JSON.parse(JSON.stringify({
            participants: this._participants,
            order: this._order,
            arrivals: this._arrivals
        }))
        this._arrivals.push(promise)
        this._maybeNextTable()
    }

    //

    // Delete arrival snapshot on acclimation.
    acclimate (promise) {
        delete this._snapshots[promise]
    }

    //

    // TODO Need to understand the pending/departed race. How is it resolved?
    // Can we be absolutely certain that we won't get an completed message for
    // an arrival that will trip us up? Appears that the `departed` flag guards
    // against that.

    //
    depart (promise) {
        // Delete the rest of the participant information from all of our data
        // structures.
        delete this._snapshots[promise]
        delete this._participants[promise]
        this._order.splice(this._order.indexOf(promise), 1)
        const table = JSON.parse(JSON.stringify(this._table))
        if (this._pending != null) {
            this._arrivals.unshift.apply(this._arrivals, this._pending.arrivals)
        }
        // Keep from generating a new table.
        this._pending = { departed: true, arrivals: [] }
        // Distribute the leadership of the departed partipant to the buckets of
        // other participants.
        const load = this._evenOuter()
        for (let i = 0, I = table.length; i < I; i++) {
            const bucket = table[i]
            const index = bucket.indexOf(promise)
            if (~index) {
                bucket.splice(index, 1)
                if (index == 0) {
                    // TODO Here we've completely collapsed consensus. That's
                    // fine, it will happen, but how are we notifying clients?
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

    //

    // If this is a departure table, we've already promoted it, but if not we
    // can now fail forward on depature using the new table.
    transition () {
        if (!this._pending.departed) {
            this._table = this._pending.table
        }
    }

    //

    // If we've departed, we generate a new table which will even out the
    // leadership, otherwise we'll go to the next table if there are arrivals.
    complete () {
        if (this._pending.departed) {
            this._redistrubute()
        } else {
            this._pending = null
            this._maybeNextTable()
        }
    }
}

module.exports = Table
