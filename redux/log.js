class Log {
    constructor (consumer) {
        this._population = null
        this._minimum = new Map
        this._log = []
        this.consumer = consumer
    }

    _check () {
        let min = this._log[log.length - 1].version
        for (const value in this._minimum.values()) {
            if (value < min) {
                min = value
            }
        }
        while (this._log[0].version < min) {
            this._log.shift()
        }
    }

    arrive (id) {
        this._minimum.put(id, 0)
    }

    minimum (id, value) {
        this._minimum.put(id, value)
        this._check()
    }

    push (entry) {
        this._log.push(entry)
        this.consumer.push(entry)
    }

    replace (version, id, index, consumer) {
    }

    depart (id) {
        this._minimum.delete(id)
        this._check()
    }
}

module.exports = Log
