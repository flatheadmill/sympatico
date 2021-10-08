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
    // Test two arrival promise and bucket index pairs for equality.

    //
    static equal (left, right) {
        return left.promise == right.promise && left.index == right.index
    }

    // The `address` locates another participant on the network.

    //
    constructor (address, log, outbox = new Queue) {
        super()
        // An arrival promise and bucket index pair.
        this.address = address
        // Outbox for messages.
        this.outbox = outbox
        // Atomic log.
        this.log = log
        // Current first stage of write.
        this._register = null
        // Initial bogus government.
        this.government = { promise: '0/0/0', majority: [] }
        // External Paxos promise and internal series number of most recent
        // message received.
        this._topmost = '0/0/0'
        // Queue of writes to submit.
        this._writes = []
        // Paused messages.
        this._backlog = []
        // Pause when we fail to send, caller will resume us.
        this.paused = false
        // Current submissions into the atomic log.
        this._submitted = []
        // Last message added to the atomic log.
        this._committed = null
        // Last used entry id.
        this._promise = '0/0/0'
        // We use this to kinda-paxos our way out of race conditions.
        this._appointment = '0/0/0'
    }

    _submit () {
        const messages = [], to = []

        // If we have a write outstanding, we will add a commit message and have
        // it ride the pulse for our new write unless, of course, the
        // outstanding write is a government, in which case we want it to be
        // resolved before we start sending new messages.

        if (this._submitted.length != 0) {
            const submitted = this._submitted[0]
            messages.push({ method: 'commit', promise: submitted.body.promise })
            if (submitted.body.method == 'appoint') {
                this.outbox.push({
                    method: 'send',
                    promise: this.government.promise,
                    address: this.address,
                    to: submitted.to,
                    messages
                })
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
            case 'appoint': {
                    this._promise = write.government.promise
                    messages.push({
                        method: 'write',
                        to: to.slice(),
                        body: {
                            method: 'appoint',
                            promise: write.promise,
                            register: write.usurp ? coalesce(this._register, this._committed) : null,
                            arrivals: write.to.filter(to => ! this.government.majority.find(promise => Phaser.equal(to, promise))),
                            majority: write.government.majority
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
            this._submitted.push(messages[messages.length - 1])
        } else {
            to.push.apply(to, this.government.majority)
        }

        if (messages.length) {
            this.outbox.push({
                method: 'send',
                to: to,
                promise: this.government.promise,
                address: this.address,
                messages: messages
            })
        }
    }

    _submitIf () {
        if (this._submitted.length == 0) {
            this._submit()
        }
    }

    // Appointment pauses the phaser so that user messages are placed in a
    // blacklog and processed when the phaser gets an explicit resume. We place
    // the new government at the end of the queue so that all the existing
    // entries with assigned promises based on the previous goverment are
    // written before the new government.

    // While we wait for the new government, there may be a departure that will
    // generate an emergency government. This subsequent appointment will get
    // appended to the queue and run immediately after the existing government.

    // We do not control unpausing, i.e. resuming within the phaser. It is
    // controlled from outside the phaser.

    // Appointments are always based on either an existing leader expanding or
    // else an existing member usurping. If we are usurping we will include a
    // `register` property which contains the last register value or the last
    // commit value. Except for bootstrap appointments will always be invoked on
    // a phaser that is actively paritcipating.

    //
    appoint (promise, majority) {
        // If we are bootstrapping, we simply get things rolling by sending the
        // government to ourselves.

        this.paused = true

        // If true we are usurping the existing government.
        let usurp = false

        // The new government.
        const government = {
            promise: `${promise}/0`,
            majority: majority
        }

        // If we are bootstrapping, so we cheat and make the bogus first
        // government a majority of us alone so we send the initial government
        // to ourselves. We don't leave the majority empty because otherwise we
        // will reset ourselves and clear out our `_submitted` poperty.
        if (majority.length == 1) {
            this.log.push({ method: 'reset', address: this.address })
            this._topmost = '0/0/0'
            this._committed = null
            this._backlog.length = 0
            this._writes.length = 0
            this._submitted.length = 0
            this._appointment = '0/0/0'
            this.government = {
                promise: '0/0/0',
                majority: []
            }
        // If we are usurping we set the government now so that the greater
        // government promise will cause to reject messages from the old leader
        // if it is still alive somehow.
        } else if (! Phaser.equal(this.government.majority[0], this.address)) {
            this.government = government
            usurp = true
        }

        this._writes.push({
            to: majority,
            method: 'appoint',
            promise: `${promise}/0`,
            usurp: usurp,
            government: { promise: `${promise}/0`, majority }
        })

        this._submitIf()
    }

    // Commit a message to the log. If it is a government, we will reset our
    // writes and `backlog if we are not the the leader in the new government,
    // and we will perform additional resets if we are arriving.

    //
    _commit (now, entry, top) {
        // If our government has booted, we initialize assuming a series of '0'.
        // We can't trust our own government, we might be rejoining and it would
        // therefore be stale. There's no way to explicitly exclude, because we
        // can abandon an on-boarding.
        const { promise } = entry.body
        if (Monotonic.compare(this._topmost, promise) < 0) {
            if (entry.body.method == 'appoint') {
                const { register, majority } = entry.body
                if (register != null) {
                    this._commit(now, register)
                }
                assert(Monotonic.compare(promise, this.government.promise) >= 0)
                this.government = { majority, promise }
                if (
                    this.government.majority.length != 1 &&
                    Phaser.equal(this.government.majority[0], this.address)
                ) {
                    this.log.push({ method: 'snapshot', address: this.address, promise: this.government.promise })
                }
            }
            this._committed = entry
            this._topmost = promise
            this.log.push({ address: this.address, ...entry.body })
        }
    }

    request (request) {
        if (Monotonic.compare(request.promise, this.government.promise) < 0) {
            return false
        }
        for (const message of request.messages) {
            // When writing, we check for synchronization during an abdication.
            // A subordinate participant is attempting to take control of the
            // consensus. We need to make sure that the subordinate
            // participant is not behind by one in the atomic log.
            switch (message.method) {
            case 'write': {
                    this._register = message
                }
                break
            case 'commit': {
                    assert.equal(this._register.body.promise, message.promise)
                    const write = this._register
                    this._register = null
                    this._commit(0, write)
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
        const successful = request.to.filter(to => ! responses[`${to.promise}?${to.index}`]).length == 0
        if (! successful) {
            // TODO Retry message.
            // TODO No, retry message with any departed members missing from
            // `to`.
            return false
        }
        for (const message of request.messages) {
            switch (message.method) {
            case 'commit': {
                    assert.notEqual(this._submitted.length, 0)
                    const submitted = this._submitted.shift()
                    assert.deepEqual(message, { method: 'commit', promise: submitted.body.promise })
                }
                break
            case 'write': {
                    assert.notEqual(this._submitted.length, 0)
                    const submitted = this._submitted[0]
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

    // Phaser has no idea if it is the leader and if it should enqueue.
    resume () {
        this.paused = false
        for (const message of this._backlog) {
            this.enqueue(message)
        }
    }

    // TODO Doubt that maintaining a promise is all that important anymore. We
    // won't be able to return th promise so the caller is going to have to use
    // a cookie of their own devising.
    enqueue (message) {
        if (this.paused) {
            this._backlog.push(message)
        } else {
            // TODO Starts to make sense to index little-endian. Specific
            // applications will know whether the depth, but general applications
            // will merely want to increment by one.
            const promise = this._promise = Monotonic.increment(this._promise, 2)
            this._writes.push({ method: 'write', promise: promise, body: message })
            this._submitIf()
        }
    }
}

module.exports = Phaser
