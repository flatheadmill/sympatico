// Node.js API.
const assert = require('assert')
const events = require('events')

// An async/await queue.
const { Queue } = require('avenue')

const { coalesce } = require('extant')

// Ever increasing namespaced identifiers.
const Monotonic = require('paxos/monotonic')

const Keyify = require('keyify')

// We can reused Islander without mapping. We can send a `null` map or otherwise
// indicate a collapse and Islander will send a message to flush the its queue.
// But, we'll probably implement napping. It isn't difficult.

// This algorithm will be run per-bucket. There are no buckets within the
// consensus algorithm. Each bucket runs an independent instance of the
// consensus algorithm.

// TODO At some point we decided that we are going to maintain a government
// number somehow so that the address has only two parts consistent with Paxos.
// We can maintain this externally in our Paxos algorithm by incrementing a
// government number. We can do it per bucket, but the government number simply
// needs to be ever increasing, so it could be a single counter.

// TODO When we usurp to rebalance and not as a result of a crash we can easily
// preserve the submitted messages. In fact, we can be very certain of this by
// virtue of having the leader abdicate, run a commit to create a new government
// forwarding all the queued messages with a mapping and then forwarding
// messages after we've begun our abdication.
//
// When we transition leaders the current leader will have a queue of messages
// for which promises where issued, so that needs to get transferred to the new
// leader and remapped. We will know definiatively when the abdication takes
// place so the old leader can forward any incoming messages to the new leader.
// The new leader can keep a staging queue of these incoming messages and
// process them once it assumes leadership.
//
// Abdicate and usurp being separate seems like more work, but it probably
// isn't. At the same time abdicate seems like it is easier to reason about
// pushing the queue than pulling the queue, but it probably isn't. Streaming
// the queue is a problem for the network implementation.

//
class Phaser extends events.EventEmitter {
    // The `address` locates another participant on the network.

    //
    constructor (address, log, outbox = new Queue) {
        super()
        // JSON-object opaque address identifying both host and bucket.
        this._address = address
        // Outbox for messages.
        this.outbox = outbox
        // Atomic log.
        this.log = log
        // Current first stage of write.
        this._register = null
        // Initial bogus government.
        this.government = {
            promise: '0/0',
            majority: []
        }
        // External Paxos promise and internal series number of most recent
        // message received.
        this._top = { promise: '0/0/0' }
        // Next message in series.
        this._next = 0n
        // Queue of writes to submit.
        this._writes = []
        // Whether we've just arrived and require acclimation.
        this._arriving = false
        // Pause when we fail to send, caller will resume us.
        this.paused = false
        // Current submission into the atomic log.
        this._submitted = null
        // Last message added to the atomic log.
        this._committed = null
        this._series = 0
        this._promise = '0/0'
    }

    _submit () {
        const messages = [], to = []

        // If we have a write outstanding, we will add a commit message and have
        // it ride the pulse for our new write unless, of course, the
        // outstanding write is a government, in which case we want it to be
        // resolved before we start sending new messages.

        if (this._submitted != null) {
            const submitted = this._submitted
            messages.push({ method: 'commit', promise: submitted.body.promise })
            if (submitted.body.method == 'government') {
                this.outbox.push({
                    method: 'send',
                    from: this._address,
                    series: this._series,
                    to: submitted.to,
                    messages
                })
                return
            }
        }

        return this._actuallySubmit(messages, to)
    }

    _actuallySubmit (messages = [], to = []) {
        // Same here, if we have a commit going out we don't want to send a
        // government along as a subsequent write. A new government will have a
        // different set of addressees.
        if (
            this._writes.length != 0 &&
            (
                this._writes[0].method == 'write' || messages.length == 0
            )
        ) {
            const write = this._writes.shift()
            to.push.apply(to, write.to || this.government.majority)
            switch (write.method) {
            case 'government': {
                    this._promise = write.government.promise
                    const map = {}
                    for (const write of this._writes) {
                        const promise = this._promise = Monotonic.increment(this._promise, 2)
                        map[write.promise] = promise
                        write.promise = promise
                    }
                    // TODO Not sure why we need a separate 'reset' message. Also, how
                    // are the registerts nesting? It looks as though they are
                    // overwriting and therefore losing history.
                    messages.push({
                        method: 'reset',
                        government: JSON.parse(JSON.stringify(this.government)),
                        top: JSON.parse(JSON.stringify(this._top)),
                        committed: this._committed,
                        register: coalesce(this._submitted, this._register, this._committed),
                        arrivals: write.to.filter(to => {
                            return ! ~this.government.majority.indexOf(to)
                        })
                    }, {
                        method: 'write',
                        to: to.slice(),
                        body: {
                            method: 'government',
                            stage: write.stage,
                            promise: write.promise,
                            committed: this._committed,
                            map: map,
                            arrivals: write.to.filter(to => {
                                return ! ~this.government.majority.indexOf(to)
                            }),
                            body: write.government
                        }
                    })
                }
                break
            case 'write': {
                    messages.push({
                        method: 'write',
                        to: to.slice(),
                        body: {
                            method: 'entry',
                            promise: write.promise,
                            body: write.body
                        }
                    })
                }
                break
            }
            this._submitted = messages[messages.length - 1]
        } else {
            to.push.apply(to, this.government.majority)
        }

        if (messages.length) {
            this.outbox.push({ method: 'send', from: this._address, series: this._series, to, messages })
        }
    }

    _submitIf () {
        if (! this.paused && this._submitted == null) {
            this._submit()
        }
    }

    appoint (promise, majority) {
        // If we are bootstrapping, we simply get things rolling by sending the
        // government to ourselves.

        // TODO Race where we have an abdication that fails because of the loss
        // of a participant and then the fixed government comes in and gets
        // unshifted, a government in flight and one unshifted. Or waiting for
        // the end of a commit, then an abdication gets unshifted followed by an
        // usurpation both enqueued.
        if (this._writes.length != 0 && this._writes[0].method == 'government') {
            this._writes.shift()
        }
        // If we are we are bootstrapping, so we cheat and make the bogus first
        // government a majority of us alone so we send the initial government
        // to ourselves. We don't leave the majority empty because otherwise we
        // will reset ourselves and clear out our `_submitted` poperty.
        if (majority.length == 1) {
            this._committed = null
            this.log.push({ method: 'reset', address: this._address })
            this._top = { promise: '0/0/0' }
            this.government = {
                promise: '0/0/0',
                majority: majority
            }
        }
        const combined = majority.slice()
        if (this.government.majority.length < majority.length) {
            combined.push.apply(combined, this.government.majority.filter(address => {
                return !~combined.indexOf(address)
            }))
        }
        this._series++
        this._writes.unshift({
            to: majority,
            method: 'government',
            stage: 'appoint',
            promise: promise + '/0',
            government: { promise: promise + '/0', majority: combined }
        })
        this._actuallySubmit()
    }

    // Hold onto this thought, we really want to explicitly reset instances so
    // that the hiatus doesn't confuse them, they are leaving so they can reset
    // themselves when they return, and this can be done by setting boot to '0'.

    // If we tell something they leave, they set boot to zero, but we might have
    // to rollback before the new government comes into action, and if we do,
    // we're going to want them to preserve their state so the old leader can
    // resume. Hmm...

    // Why don't we just assume that joining a government means that the new
    // leader is going to push our state. Oh, no, because we need to pull the
    // old state from the old leader.

    // Maybe, instead of keeping a queue internal to the consensus, we submit
    // one at a time, and read the log. Which means that there is only ever one
    // message queued. If one of the consensus members drops out the submitting
    // router will get a failure message and it ran return 503. At that point it
    // could return 503 for the entire queue, or else wait for the new table.

    // No, the internal queue is good, because it allows us to interleave write
    // and commit, so we keep that. What we can do is have a rejection queue, so
    // that we have a log, and if we have our leadership revoked, we can fill
    // that rejection queue with out queue, and even, in the abstract, have a
    // rejection reason that could be the new table so we don't have to wait for
    // it.

    // Ah, but now we are returning to the problem where we are in the middle of
    // a transition, some consensi have completed and begun processing new
    // messages, other are still syncing and we have to roll back to an old

    // Okay, but let's keep the rejection queue. We'll know exactly where it
    // breaks.

    // TODO Now we need a way to give up on syncing in progress, so we should
    // add a promise to the syncing method. May as well add a series as well, so
    // we can simplify our `_submit` method, single switch statement.

    //
    _commit (now, entry, top) {
        // If our government has booted, we initialize assuming a series of '0'.
        // We can't trust our own government, we might be rejoining and it would
        // therefore be stale. There's no way to explicitly exclude, because we
        // can abandon an on-boarding.
        const { promise } = entry.body
        if (entry.body.method == 'government') {
            const { register, body: government } = entry.body
            if (register != null) {
                this._commit(now, register, top)
            }
            entry.body.committed = null
            const compare = Monotonic.compare(government.promise, this.government.promise)
            assert(compare >= 0)
            this._top.promise = government.promise
            this.government = government
            if (
                this.government.majority.length != 1 &&
                this.government.majority[0] == this._address
            ) {
                this.log.push({ method: 'snapshot', address: this._address, promise: this.government.promise })
            }
            if (this._arriving) {
                this._arriving = false
                this.log.push({
                    method: 'acclimate',
                    address: this._address,
                    bootstrap: this.government.majority.length == 1,
                    leader: this.government.majority[0]
                })
            }
        }
        this._committed = entry
        console.log('--- yes ---')
        this.log.push({ address: this._address, ...entry.body })
    }

    request (request) {
        const responses = []
        for (const message of request.messages) {
            // When writing, we check for synchronization during an abdication.
            // A subordinate participant is attempting to take control of the
            // consensus. We need to make sure that the subordinate
            // participant is not behind by one in the atomic log.
            switch (message.method) {
            case 'write': {
                    if (message.body.method == 'government') {
                        if (message.body.committed == null) {
                            assert.equal(this._committed, null)
                        } else if (!~message.body.arrivals.indexOf(this._address)) {
                            const { committed } = message.body
                            assert.notEqual(this._committed, null)
                            // Switching on BigInt literals hurts Istanbul.
                            this._commit(0, committed, this._top)
                        }
                    }
                    this._register = message
                }
                break
            case 'commit':
                const write = this._register
                this._register = null
                this._commit(0, write, this._top)
                break
            case 'reset':
                if (~message.arrivals.indexOf(this._address)) {
                    this.government = message.government
                    this._top = message.top
                    this._committed = message.committed
                    this._arriving = true
                    this._submitted = null
                } else if (message.register != null) {
                    this._commit(0, message.register, this._top)
                }
                break
            }
        }
        return responses
    }

    //

    // Handles responses from both channels. `commit`, `write` and `synced` are
    // pulse channel messages, `reset` and `sync` are sync channel messages. A
    // pulse may have a write or commit or both, or a synced.
    //
    // After a write we know we need to submit so we call it then, `_submit`
    // will send the next write if any. Otherwise we call `_submitIf` after the
    // message loop so that the next message is sent after a lone `commit` or
    // `synced` if any. If we are responding to a `sync` message the `_submitIf`
    // is benign and effectively a no-op because either syncing is in progress
    // or there is nothing to sync, syncing begins begun after a message
    // enqueues or a pulse completes, not arbitrarily.

    //
    response (request, responses) {
        const successful = request.to.filter(to => ! responses[Keyify.stringify(to)]).length == 0
        if (! successful || request.series != this._series) {
            // TODO Retry message.
            // TODO No, retry message with any departed members missing from
            // `to`.
            return false
        }
        // We will only get responses if they are rejections, if the participant
        // is ahead of us in the message log.
        for (const to in responses) {
            for (const message of responses[to]) {
                assert.equal(message.method, 'ahead')
                const { committed } = message
                this._commit(0, committed, this._top)
                const submitted = this._submitted
                this._submitted = null
                console.log(request.messages[0])
                assert.equal(request.messages[0].method, 'reset')
                this.paused = true
                this._writes.unshift({
                    to: submitted.to,
                    method: 'government',
                    stage: 'appoint',
                    promise: submitted.body.promise,
                    government: request.messages[1].body.body
                })
                // TODO Add timestamp.
                this.outbox.push({ method: 'rejected' })
                return false
            }
        }
        for (const message of request.messages) {
            switch (message.method) {
            case 'commit': {
                    assert.notEqual(this._submitted, null)
                    const submitted = this._submitted
                    this._submitted = null
                    assert.deepEqual(message, { method: 'commit', promise: submitted.body.promise })
                }
                break
            case 'write': {
                    assert.notEqual(this._submitted, null)
                    const submitted = this._submitted
                    const { method, promise } = message.body
                    assert.deepEqual({ method, to: request.to, promise }, {
                        to: submitted.to,
                        method: submitted.body.method,
                        promise: submitted.body.promise
                    })
                    this._submit()
                }
                break
            }
        }
        this._submitIf()
        return null
    }

    // TODO This ought to be dead.
    resume () {
        this.paused = false
        this._submitIf()
    }

    enqueue (message) {
        const promise = this._promise = Monotonic.increment(this._promise, 2)
        this._writes.push({ method: 'write', promise: promise, body: message })
        this._submitIf()
        return promise
    }
}

module.exports = Phaser
