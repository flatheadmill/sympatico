// TODO Going to need syncrhonization, yeah, so we can push snapshots one at a
// time, and then have them join with a sync.
//
// Going to keep it simple. Rather than streaming, sending one message at a
// time, including the snapshot. It will be one chunk of JSON at time.
// Synchronization will be one commit at a time. Saves having to think too hard
// about the networking. Will slow down joins, but speed up development.
const assert = require('assert')

const Avenue = require('avenue')
const Monotonic = require('paxos/monotonic')
const events = require('events')
const Pause = require('./pause')

const noop = () => {}

const dump = require('./dump')

class Paxos extends events.EventEmitter {
    constructor (destructible, transport, router, bucket) {
        super()
        this._router = router
        this.bucket = bucket
        this.government = {
            promise: '0/0',
            majority: []
        }
        this.pause = new Pause
        this.leader = router.address
        this.log = new Avenue()
        this.snapshot = new Avenue()
        this.outbox = new Avenue()
        this._tail = this.log.shifter().sync
        this.pinged = new Avenue()
        this.destroyed = false
        this._writes = [ [] ]
        this._transport = transport
        destructible.durable('consensus', this._send.bind(this))
        destructible.destruct(() => {
            this.destroyed = true
            transport.notify(router.address, bucket)
        })
    }

    bootstrap () {
        this.government = {
            promise: '1/0',
            majority: [ this._router.address ]
        }
        this._top = '1/0'
        this.promise = '1/0'
        this.log.push({ isGovernment: true, promise: '1/0', body: this.government })
    }

    join () {
        this._top = '0/0'
    }


    // Need to use the hegemonic promise as some sort of veto, I'll bet. Keep the
    // internal promise separate because I've just adopted this transitional
    // government scheme. We'll call the hegemonic promise the identifier.
    arrive (identifier, majority) {
        const promise = this._top
        const diff = majority.filter(address => !this.government.majority.includes(address))
        const tail = this._tail.shifter().sync
        while (tail.peek().promise != promise) {
            assert(tail.peek())
            tail.shift()
        }
        tail.shift()
        this._arrival = {
            state: 'snapshotting',
            abdicated: this.government.majority[0] != majority[0],
            identifier, majority, diff, promise, tail
        }
        this.snapshot.push({ method: 'snapshot', to: diff, bucket: this.bucket, promise })
    }

    transition (identifier, majority) {
        const government = this._government(majority, this.government.majority)
        const write = {
            to: government.majority,
            messages: [{
                method: 'write',
                promise: government.promise,
                identifier: identifier,
                isGovernment: true,
                government
            }],
            sent: noop
        }
        this._writes[this._writes.length - 1].unshift(write)
        this._transport.notify(this._router.address, this.bucket)
    }

    // Note that for surge replace we're going to do things at the router level.
    // Our majority will be shaped such that the delegates are not on the left
    // or right of the new leader, but remain in the place of the old leader.
    // We'll move to the new leader. Then we can mark the old leader as gone. In
    // doing so we don't have to do a depart because there not be a Paxos
    // running on that old leader.

    // Basically, I get to think about how to to rebalance outside of this
    // class. This class is unaware of our left-right neighbor concept.
    depart (identifier, majority) {
        // Here we would delete the snapshot preventing any further
        // synchronization, we might have a synchronization in flight.

        // We have to consider the race conditions. In our half-Paxos, are we in
        // the middle of some sort of government transition? Is it going to
        // fail? It means we can't goof around with synchronize, though. We have
        // to be certain we've completed our synchronization before we
        // transition the government.

    }

    // Okay. So you tell the old leader to go ahead and push the new government
    // to the new leader, even if the old leader will not be a member of the new
    // government.
    //
    // So the router can keep a queue of new governments. We won't short circuit
    // for now a new arrival, but instead work through all the government
    // changes as we grow the cluster.
    //
    // What if when we put in our acclimate message, when it counts down, in the
    // router we will know that we can skip any tables that are currently
    // queued, just pop the last one, the last table, and clear the queue. We'll
    // know that everyone has the same list of tables.
    //
    // But, we don't abort the creation of a government. Too annoying.
    _government (next, previous) {
        const government = JSON.parse(JSON.stringify(this.government))
        const combined = next.concat(previous)
        const majority = combined.filter((address, index) => combined.indexOf(address) == index)
        government.majority = majority
        government.promise = Monotonic.increment(government.promise, 0)
        government.abdication = majority[0] != this._router.address
        return government
    }

    // TODO There is no rejection here. There will have to be some rejection.
    receive (messages) {
        for (const message of messages) {
            switch (message.method) {
            case 'write':
                this._write = message
                break
            case 'commit':
                const write = this._write
                this._write = null
                this._commit(0, write, this._top)
                break
            case 'unpause':
                this._router.decrement(message.identifier, 'transfer')
                this.pause.allow(message.identifier)
                break
            default:
                throw new Error(message.method)
            }
        }
        return true
    }

    // We set a new government the moment we can abidcate and then hop
    // everything, so maybe no more map, but a history attached to the promise,
    // if we are still sending promises back.

    //
    enqueue (body) {
        const promise = this.promise = Monotonic.increment(this.promise, 1)
        this._writes[this._writes.length - 1].push({
            messages: [{ method: 'write', promise, isGovernment: false, body }],
            sent: noop
        })
        this._transport.notify(this._router.address, this.bucket)
    }


    // No idea how long the snapshot is going to take. We may have a significant
    // backlog of log messages that need to now be forwarded to the new
    // participants and replayed. We want to send them in chunks so we can
    // continue to run our two-phase commits while the new arrivals are syncing.

    //
    snapshotted (identifier) {
        const sync = () => {
            // Get a chunk of messages.
            const splice = this._arrival.tail.splice(32)
            const messages = splice.reduce((messages, entry) => {
                return messages.concat({
                    method: 'write', ...entry
                }, {
                    method: 'commit', promise: entry.promise
                })
            }, [])
            this._writes.unshift([{
                to: this._arrival.diff,
                messages: messages,
                sent: sync
            }])
            if (splice.length < 32) {
                // We are done so our next action is a noop.
                this._writes[0][0].sent = noop
                // Sometimes I debug dump below, so clear out this noisy
                // property.
                this._arrival.tail = null
                // This is dirty. This is the current write and it is in the
                // midst of the two-phase commit. We're going have it commit
                // prematurely, but it won't matter if there is a collapse
                // before the new government goes out because in the event of a
                // collapse the new participant will be dropped.
                //
                // Although, we're probably going to have to have rejection
                // anyway when it comes time to do depart where someone will
                // usurp the government.
                //
                // Even if we allow the ordinary mechanism commit the write, it
                // will unshift the government commit ahead of this commit, so
                // we probably have to keep this even when there is a rejection.
                // Essentially, we simply need to ensure that no one will learn
                // anything from the new participant until it gets a new
                // government. That is the simple rule that makes this okay.
                if (this._write != null) {
                    messages.push(this._write)
                    messages.push({ method: 'commit', promise: this._write.promise })
                }
                // We're not going to pushback a commit. We can assert that
                // there is only one message here.
                assert(this._writes[1].length == 0 || this._writes[1].messages.length == 1)
                // We want to sent the message to our current majority with
                // ourselves as the leader when we are abdicating, so let's get
                // a list with everyone but ourselves.
                const excluded = this._arrival.majority.filter(address => address != this._router.address)
                // Construct a new government.
                //
                // TODO Reassign backlogged promises.
                const government = this._government(this._arrival.majority, this.government.majority)
                // Our new government write.
                const write = {
                    to: ([ this._router.address ]).concat(excluded),
                    bucket: this.bucket,
                    messages: [{
                        method: 'write',
                        promise: government.promise,
                        identifier: this._arrival.identifier,
                        isGovernment: true,
                        government
                    }],
                    sent: noop
                }
                // If we're abdicating, our queued messages need to be queued in
                // the new leader. We send the new messages one at a time. This
                // particular hop is done through the Paxos channel and not the
                // Router channel. Note that this is the same HTTP connection,
                // but a different endpoint. The router channel will pause at
                // the new leader until the unpause method arrives so that the
                // streams remain in order.
                //
                // If we're not abidicating, then we simply unshift the new
                // government onto the queue. It runs next.
                if (this._arrival.abdicated) {
                    this._writes[1] = ([ write ]).concat(this._writes[1].map(entry => {
                        return {
                            to: [ government.majority[0] ],
                            method: 'enqueue',
                            body: entry,
                            sent: noop
                        }
                    })).concat([{
                        to: [ government.majority[0] ],
                        messages: [{ method: 'unpause', identifier: this._arrival.identifier }],
                        sent: noop
                    }])
                } else {
                    this._writes[1].unshift(write)
                }
                // Nudge the send loop.
                this._transport.notify(this._router.address, this.bucket)
            }
        }
        sync()
    }

    _commit (now, entry, top) {
        const isGovernment = Monotonic.isGovernment(entry.promise)
        if (isGovernment) {
            assert(Monotonic.compare(this.government.promise, entry.promise) < 0, 'governments out of order')

            const collapse = this.government.majority.length > entry.government.majority.length
            this.log.push({
                promise: entry.promise,
                isGovernment: true,
                body: this.government = entry.government
            })
            this._router.decrement(entry.identifier, 'transfer')
        } else {
            this._top = entry.promise
            this.log.push({
                promise: entry.promise,
                isGovernment: false,
                body: entry.body
            })
        }
    }

    async _send () {
        // Loop until we shutdown.
        while (!this.destroyed) {
            // We have an array of arrays of writes. We shift the array of
            // arrays when the first array is empty.
            while (this._writes[0].length == 0 && this._writes.length != 1) {
                this._writes.shift()
            }
            // If we have no writes, we snooze until we're notified.
            if (this._writes[0].length == 0) {
                await this._transport.wait(this._router.address, this.bucket)
                continue
            }
            const write = this._writes[0].shift()
            const envelope = {
                to: write.to || this.government.majority.slice(),
                bucket: this.bucket,
                messages: write.messages
            }
            // For messages that go to a quorum, we remove ourselves and send
            // synchronously. The synchronous send eliminates sundry race
            // condition considertions. There are no asynchronous state changes
            // in the leader, only in the peers.
            const leader = envelope.to[0] == this._router.address
            if (leader) {
                envelope.to.shift()
                this.receive(envelope.messages)
            }
            // Hmm... The `responses` map isn't making much senese anymore.
            // Maybe throw an exception? Or just return false? Oh, no. Someone
            // you speak with might be ahead of you, so it would return a
            // rejection, and that is not an exceptional condition, really.
            const responses = await this._transport.send(envelope)
            // This callback is for post snapshot message sync, interleaving log
            // fast-forwarding with the two-phase commit to we don't feel a
            // pause.
            write.sent.call()
            // If we where the leader, this was a message write, so I suppose,
            // the only messages sent with the leader out front are two-phase
            // commit messages. We can come back and tighten up the logic around
            // this rule later.
            if (leader) {
                assert(1 <= envelope.messages.length && envelope.messages.length <= 2)
                assert(envelope.messages[envelope.messages.length - 1].method == 'write')
                const commit = {
                    method: 'commit',
                    promise: envelope.messages[envelope.messages.length - 1].promise
                }
                this.receive([ commit ])
                if (this._writes[this._writes.length - 1].length == 0) {
                    this._writes[this._writes.length - 1].push({
                        to: envelope.to,
                        messages: [ commit ],
                        sent: noop
                    })
                } else {
                    this._writes[this._writes.length - 1][0].messages.unshift(commit)
                }
            }
        }
    }
}

module.exports = Paxos
