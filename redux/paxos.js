const Promise = require('./promise')

class Paxos {
    constructor ({ outbox, startTime, assembly, leaders, promise }) {
        this.members = null
        this._outbox = outbox
        this._leaders = leaders
        this._startTime = startTime
        this._assembly = assembly
        this._promise = promise
        this._promised = [ 0, 0 ]
        this._proposed = [ 0, 0 ]
        this._proposal = null
        this._promises = new Map
        this._accepted = new Map
        this._register = { promise: [ 0 , 0 ] }
    }

    dispatch (message) {
        switch (message.method) {
        case 'prepare': {
                this.prepare(message)
                break
            }
        case 'promised': {
                this.promised(message)
                break
            }
        case 'propose': {
                this._propose(message)
                break
            }
        case 'accept': {
                this._accept(message)
                break
            }
        }
    }

    propose (members) {
        this._promises = new Map
        this._proposal = {
            method: 'prepare',
            startTime: this._startTime,
            assembly: this._assembly,
            members: members,
            promise: this._proposed = this._promise.create()
        }
        this._outbox.push({ ...this._proposal })
    }

    prepare (proposal) {
        if (
            proposal.startTime == this._startTime &&
            proposal.assembly == this._assembly &&
            Promise.compare(proposal.promise, this._register.promise) > 0
        ) {
            this._outbox.push({
                method: 'promised',
                startTime: this._startTime,
                assembly: this._assembly,
                id: this._promise.id,
                members: proposal.members,
                promise: this._promised = proposal.promise,
                register: JSON.parse(JSON.stringify(this._register))
            })
        }
    }

    // Only send your accept message
    promised (promised) {
        if (
            promised.startTime == this._startTime &&
            promised.assembly == this._assembly &&
            Promise.compare(promised.promise, this._proposed) == 0
        ) {
            this._promises.set(promised.id, promised)
            if (this._promises.size == Math.floor(this._leaders.length / 2 + 1)) {
                let accepted = { promise: [ 0, 0 ] }
                for (const promised of this._promises.values()) {
                    if (Promise.compare(promised.register.promise, accepted.promise) > 0) {
                        accepted = promised.register
                    }
                }
                if (Promise.compare(accepted.promise, [ 0, 0 ]) == 0) {
                    accepted = this._proposal
                }
                this._outbox.push({
                    method: 'propose',
                    startTime: this._startTime,
                    assembly: this._assembly,
                    promise: this._promised,
                    register: accepted
                })
            }
        }
    }

    _propose (message) {
        if (
            message.startTime == this._startTime &&
            message.assembly == this._assembly &&
            Promise.compare(message.promise, this._promised) == 0
        ) {
            this._register = message.register
            this._outbox.push({
                method: 'accept',
                id: this._promise.id,
                startTime: this._startTime,
                assembly: this._assembly,
                register: message.register
            })
        }
    }

    _accept (message) {
        if (
            message.startTime == this._startTime &&
            message.assembly == this._assembly
        ) {
            const key = message.register.promise.join('/')
            if (! this._accepted.has(key)) {
                this._accepted.set(key, { set: new Set(), register: message.register })
            }
            const accepted = this._accepted.get(key)
            accepted.set.add(message.id)
            if (accepted.set.size == Math.floor(this._leaders.length / 2 + 1)) {
                this.members = accepted.register.members
            }
        }
    }

    response (owner, proposal, response) {
        if (response.accepted) {
        }
    }
}

module.exports = Paxos
