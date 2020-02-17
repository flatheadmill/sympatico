const assert = require('assert')

const Monotonic = require('paxos/monotonic')

function semaphore () {
    const semaphore = {}
    semaphore.promise = new Promise(resolve => semaphore.resolve = resolve)
    return semaphore
}

class Pause {
    constructor () {
        this._allowed = '0/0'
        this._semaphore = semaphore()
        this._semaphore.resolve.call()
    }

    allow (identifier) {
        assert(this._allowed != identifier)
        this._allowed = identifier
        this._semaphore.resolve.call()
        this._semaphore = semaphore()
    }

    clear () {
        this._semaphore.resolve.call()
    }

    async allowed (identifier) {
        while (Monotonic.compare(this._allowed, identifier) < 0) {
            await this._semaphore.promise
        }
    }
}

module.exports = Pause
