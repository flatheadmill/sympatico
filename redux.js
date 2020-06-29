// Node.js API.
const assert = require('assert')
const events = require('events')

// An async/await queue.
const Queue = require('avenue')

// Ever increasing namespaced identifiers.
const Monotonic = require('paxos/monotonic')

class Consensus extends events.EventEmitter {
    // The `address` is the Paxos promise that that identifies the participant.

    //
    constructor (address) {
        super()
        this._address = address
        this.outbox = {
            pulse: new Queue,
            sync: new Queue
        }
        this.log = new Queue
        this._trailer = this.log.shifter().sync
        this._write = null
        this.government = {
            promise: '0/0',
            majority: []
        }
        this._syncing = []
        this._top = {
            promise: '0/0',
            series: 0n
        }
        this._next = 0n
        this._submissions = []
        this._writes = []
    }

    _submit () {
        const messages = [], to = []
        // When submitting governments
        if (this._submissions.length != 0) {
            const submission = this._submissions[0]
            messages.push({
                method: 'commit',
                promise: submission.promise,
                series: submission.series
            })
            if (submission.method == 'government') {
                this.outbox.pulse.push({ to: submission.to, messages })
                return
            }
        }
        to.push.apply(to, this.government.majority.filter(address => {
            return ! this._syncing.includes(address)
        }))
        if (
            this._writes.length != 0 &&
            (
                this._writes[0].method != 'government' || messages.length == 0
            )
        ) {
            const write = this._writes.shift()
            if (write.method == 'government') {
                messages.push({
                    method: 'write',
                    body: {
                        method: 'government',
                        promise: write.promise,
                        series: (++this._next).toString(),
                        body: write.government
                    }
                })
            } else {
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
            const { method, promise, series } = messages[messages.length - 1].body
            this._submissions.push({ method, to, promise, series })
        }
        if (messages.length) {
            this.outbox.pulse.push({ to, messages })
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
        if (majority.length == 1) {
            this.government = {
                promise: '0/0',
                majority: majority
            }
        }
        const to = majority.length == 1 ? majority : this.government.majority
        this._writes.unshift({
            method: 'government',
            to: to,
            promise: promise,
            government: { promise: promise, majority: majority }
        })
        this._submitIf()
    }

    // Hold onto this thought, we really want to explicitly reboot instances so
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

    //
    _commit (now, entry, top) {
        // If our government has booted, we initialize assuming a series of '0'.
        // We can't trust our own government, we might be rejoining and it would
        // therefore be stale. There's no way to explicitly exclude, because we
        // can abandon an on-boarding.
        const { promise, series } = entry.body
        if (entry.body.method == 'government') {
            const { body: government } = entry.body
            assert(Monotonic.compare(government.promise, this.government.promise) > 0)
            if (government.majority.length == 1) {
                this._top = {
                    promise: entry.promise,
                    series: 0n
                }
            } else {
                this._top.promise = government.promise
            }
            if (government.majority[0] == this._address) {
                this._syncing = government.majority.slice(1).filter(address => {
                    return ! this.government.majority.includes(address)
                })
                this._backlog = this._trailer.shifter().sync
            }
            console.log('>>>>', government)
            this.government = government
        }
        this.log.push(entry)
        assert.equal(BigInt(series), this._top.series + 1n)
        this._top.series = BigInt(series)
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
            case 'sync':
                this.outbox.pulse.push({
                    method: 'forward',
                    to: this.government.majority.slice(0, 1),
                    ...this._top.log
                })
                break
            case 'accept':
                break
            case 'forward':
                break
            }
        }
        return true
    }

    response (request, responses) {
        const successful = request.to.filter(to => ! responses[to]).length == 0
        if (!successful) {
            return
        }
        for (const message of request.messages) {
            switch (message.method) {
            case 'write': {
                    assert.notEqual(this._submissions.length, 0)
                    const submission = this._submissions[0]
                    const { method, promise, series } = message.body
                    assert.deepEqual({ method, to: request.to, promise, series }, submission)
                    this._submit()
                }
                break
            case 'commit': {
                    assert.notEqual(this._submissions.length, 0)
                    const committed = this._submissions.shift()
                    assert.deepEqual(message, {
                        method: 'commit',
                        promise: committed.promise,
                        series: committed.series
                    })
                    this._submit()
                }
                break
            }
        }
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
