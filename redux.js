// Node.js API.
const assert = require('assert')
const events = require('events')

// An async/await queue.
const Queue = require('avenue')

// Ever increasing namespaced identifiers.
const Monotonic = require('paxos/monotonic')

// A per-bucket participant. No bucket property is kept in the participant, that
// would be a property of the address. No bucketing here at all, this is just a
// two-phase commit machine.

// TODO No idea yet how we clear the queue. Probably submit a clear message and
// it goes through like a normal message but the entry is called `'clear'`
// instead of `'government'` or `'write'`.

class Consensus extends events.EventEmitter {
    // The `address` locates another participant on the network.

    //
    constructor (address) {
        super()
        // Address of a nother particpant on the network and among the buckets.
        // This implementation is bucket un-aware.
        this._address = address
        // Outbox for message.
        this.outbox = new Queue
        // Atomic log.
        this.log = new Queue
        // Current first stage of write.
        this._write = null
        // Initial bogus government.
        this.government = {
            promise: '0/0',
            majority: []
        }
        // External Paxos promise and internal series number of most recent
        // message received.
        this._top = {
            promise: '0/0',
            series: '0'
        }
        // Next message in series.
        this._next = 0n
        // Current submission.
        this._submissions = []
        // Queue of writes to submit.
        this._writes = []
    }

    _submit () {
        const messages = [], to = []

        // If we have a write outstanding, we will add a commit message and have
        // it ride the pulse for our new write unless, of course, the
        // outstanding write is a government, in which case we want it to be
        // resolved before we start sending new messages.

        if (this._submissions.length != 0) {
            const submission = this._submissions[0]
            messages.push({
                method: 'commit',
                promise: submission.promise,
                series: submission.series
            })
            if (submission.method == 'government') {
                this.outbox.push({ to: submission.to, messages })
                return
            }
        }

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
                    messages.push({
                        method: 'reset',
                        government: JSON.parse(JSON.stringify(this.government)),
                        top: JSON.parse(JSON.stringify(this._top)),
                        arrivals: write.to.filter(to => {
                            return ! ~this.government.majority.indexOf(to)
                        })
                    }, {
                        method: 'write',
                        body: {
                            method: 'government',
                            stage: write.stage,
                            promise: write.promise,
                            series: (++this._next).toString(),
                            body: write.government
                        }
                    })
                }
                break
            case 'write': {
                    messages.push({
                        method: 'write',
                        body: {
                            method: 'entry',
                            promise: this.government.promise,
                            series: (++this._next).toString(),
                            body: write.body
                        }
                    })
                }
                break
            }
            const { method, promise, series } = messages[messages.length - 1].body
            this._submissions.push({ method, to, promise, series })
        } else {
            to.push.apply(to, this.government.majority)
        }

        if (messages.length) {
            this.outbox.push({ to, messages })
        }
    }

    _submitIf () {
        if (this._submissions.length == 0) {
            this._submit()
        }
    }

    appoint (promise, majority) {
        // If we are bootstrapping, we simply get things rolling by sending the
        // government to ourselves.

        // TODO Do it two-phase even at bootstrap. Hops will queue up requests
        // in the pending promise.

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
        // to ourselves.
        const combined = majority.slice()
        if (majority.length == 1) {
            this.log.push({ method: 'reset' })
            this.top = {
                promise: '0/0',
                series: '0'
            }
            this.government = {
                promise: '0/0',
                majority: majority
            }
        }
        this._appointment = {
            state: 'syncing',
            promise: promise,
            majority: majority
        }
        combined.push.apply(combined, this.government.majority.filter(address => {
            return !~combined.indexOf(address)
        }))
        this._writes.unshift({
            to: majority,
            method: 'government',
            stage: 'appoint',
            promise: promise,
            government: { promise: promise, majority: combined }
        })
        this._submitIf()
    }

    // Acclimation is transmitted through the outer Paxos. Unlikely that all
    // participants will acclimate before a new appointment. We won't do this
    // during orderly growth of the participant population, only during
    // abdication, and then it would mean that a participant has become
    // unreachable, but it still somehow able to enqueue its application message
    // after the abdication message that removes it.

    acclimated (promise) {
        assert(this._appointment != null)
        if (this._appointment.promise == promise) {
            const { majority } = this._appointment
            this._appointment = null
            this._writes.unshift({
                to: majority,
                method: 'government',
                stage: 'acclimated',
                promise: promise,
                government: { promise, majority }
            })
            this._submitIf()
        }
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
        const { promise, series } = entry.body
        if (entry.body.method == 'government') {
            const { stage, body: government } = entry.body
            const compare = Monotonic.compare(government.promise, this.government.promise)
            if (stage == 'appoint') {
                assert(compare > 0)
            } else {
                assert.equal(compare, 0)
            }
            this._top.promise = government.promise
            this.government = government
        }
        this.log.push(entry.body)
        this._top.series = series
    }

    request (request) {
        for (const message of request.messages) {
            switch (message.method) {
            case 'write':
                this._write = message
                break
            case 'commit':
                const write = this._write
                this._write = null
                this._commit(0, write, this._top)
                break
            case 'reset':
                if (~message.arrivals.indexOf(this._address)) {
                    this.government = message.government
                    this._top = message.top
                }
                break
            }
        }
        return true
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
        const successful = request.to.filter(to => ! responses[to]).length == 0
        if (!successful) {
            return
        }
        for (const message of request.messages) {
            switch (message.method) {
            case 'commit': {
                    assert.notEqual(this._submissions.length, 0)
                    const committed = this._submissions.shift()
                    assert.deepEqual(message, {
                        method: 'commit',
                        promise: committed.promise,
                        series: committed.series
                    })
                }
                break
            case 'write': {
                    assert.notEqual(this._submissions.length, 0)
                    const submission = this._submissions[0]
                    const { method, promise, series } = message.body
                    assert.deepEqual({ method, to: request.to, promise, series }, submission)
                    this._submit()
                }
                break
            }
        }
        this._submitIf()
    }

    enqueue (message) {
        this._writes.push({
            method: 'write',
            promise: '0/0',
            body: message
        })
        this._submitIf()
    }
}

module.exports = Consensus
