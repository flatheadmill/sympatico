const assert = require('assert')

class Log {
    constructor (consumer) {
        this._minimum = new Map
        this._entries = []
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
            assert(i < this._entries.length)
            if (this._entries[i].version == min) {
                break
            }
            i++
        }
        this._entries.splice(0, i)
    }

    maximum () {
        return this._entries[this._entries.length - 1].version
    }

    minimum () {
        return this._entries[0].version
    }

    arrive (id) {
        this._minimum.set(id, 0n)
    }

    advance (id, value) {
        this._minimum.set(id, value)
        this._check()
    }

    push (entry) {
        this._entries.push(entry)
        this.consumer.push(entry)
    }

    replay (version, node, index, consumer) {
        let i = 0
        for (;;) {
            assert(i < this._entries.length)
            const entry = this._entries[i]
            if (this._entries[i].version == version &&
                this._entries[i].node == node &&
                this._entries[i].index == index
            ) {
                break
            }
            i++
        }
        i++
        assert(i < this._entries.length)
        for (; i < this._entries.length; i++) {
            consumer.push(this._entries[i])
        }
    }

    depart (id) {
        this._minimum.delete(id)
        this._check()
    }
}

module.exports = Log
