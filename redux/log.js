const assert = require('assert')

class Log {
    constructor (consumer) {
        this._population = null
        this._minimum = new Map
        this._log = []
        this.consumer = consumer
    }

    _check () {
        let min = this.maximum()
        for (const value of this._minimum.values()) {
            if (value < min) {
                min = value
            }
        }
        let i = 0
        for (;;) {
            assert(i < this._log.length)
            if (this._log[i].version == min) {
                break
            }
            i++
        }
        this._log.splice(0, i)
    }

    maximum () {
        return this._log[this._log.length - 1].version
    }

    minimum () {
        return this._log[0].version
    }

    arrive (id) {
        this._minimum.set(id, 0n)
    }

    advance (id, value) {
        this._minimum.set(id, value)
        this._check()
    }

    push (entry) {
        this._log.push(entry)
        this.consumer.push(entry)
    }

    replay (version, node, index, consumer) {
        let i = 0
        for (;;) {
            assert(i < this._log.length)
            const entry = this._log[i]
            if (this._log[i].version == version &&
                this._log[i].node == node &&
                this._log[i].index == index
            ) {
                break
            }
            i++
        }
        i++
        assert(i < this._log.length)
        for (; i < this._log.length; i++) {
            consumer.push(this._log[i])
        }
    }

    depart (id) {
        this._minimum.delete(id)
        this._check()
    }
}

module.exports = Log
