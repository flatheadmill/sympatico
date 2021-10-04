const assert = require('assert')

class Bucket {
    static equal (left, right) {
        if (left.length == right.length) {
            for (let i = 0, I = left.length; i < I; i++) {
                if (left[i].promise != right[i].promise || left[i].index != right[i]. index) {
                    return false
                }
            }
            return true
        }
        return false
    }

    constructor (series, promise, index, majoritySize, majority = [], departed = []) {
        this.series = series
        this.promise = promise
        this.index = index
        this.majoritySize = majoritySize
        this.majority = majority
        this.departed = departed
    }

    get status () {
        return {
            majority: this.majority.slice(0)
        }
    }

    get stable () {
        return this._strategy.stable
    }

    depart (promise) {
        this._strategy = this._strategy.depart(promise)
    }

    // TODO Strange arguments.
    bootstrap ({ instances, buckets }) {
        const siblings = instances.concat(instances)
        const index = buckets[this.index]
        const majority = siblings.slice(index, index + Math.min(instances.length, this.majoritySize))
                                  .map(promises => { return { promise: promises[0], index: this.index } })
        return [{
            method: 'paxos',
            series: this.series[0],
            index: this.index,
            cookie: '0',
            request: [{
                method: 'appoint',
                to: [ majority[0] ],
                majority: majority
            }],
            response: majority.map(address => {
                return { method: 'majority', to: majority, majority: majority.map(address => address.promise) }
            })
        }]
    }

    expand (options) {
        const instances = options.instances.concat(options.instances)
        const index = options.buckets[this.index]
        const participants = instances.slice(index, index + Math.min(options.instances.length, this.majoritySize))
        const left = participants.map(promise => ({ promise: promise[0], index: this.index }))
        const right = participants.map(promise => ({ promise: promise[0], index: this.index + options.buckets.length / 2 }))
        const combined = left.concat(right)
        return [{
            method: 'paxos',
            series: this.series[0],
            index: this.index,
            cookie: '0',
            request: [{
                method: 'appoint', majority: combined, to: [ combined[0] ]
            }],
            response: [{
                method: 'majority', to: [{ promise: '0/0', index: left[0].index }], majority: left.map(address => address.promise)
            }, {
                method: 'majority', to: [{ promise: '0/0', index: right[0].index }], majority: right.map(address => address.promise)
            }]
        }, {
            method: 'paxos',
            series: this.series[0],
            index: this.index,
            cookie: '0',
            request: [{
                method: 'appoint',
                to: [ left[0] ],
                majority: left
            }, {
                method: 'appoint',
                to: [ right[0] ],
                majority: right
            }],
            response: [{
                method: 'purge',
                to: combined
            }]
        }]
    }

    migrate (options) {
        const from = this.majority.filter(promise => ! this.departed.includes(promise))
        const instances = options.instances.concat(options.instances)
        const index = options.buckets[this.index]
        const to = instances.slice(index, index + Math.min(options.instances.length, this.majoritySize))
                            .map(instance => instance[0])
        if (from.every((promise, index) => to[index] == promise)) {
            return []
        }
        const combined = from.concat(to)
        const difference = from.filter(promise => ! to.includes(promise))
                               .map(promise => ({ promise, index: this.index }))
        const indexed = {
            combined: combined.filter((promise, index) => combined.indexOf(promise) == index)
                              .map(promise => { return { promise, index: this.index } }),
            to: to.map(promise => { return { promise, index: this.index } }),
            difference: difference.map(promise => { return { promise, index: this.index } })
        }
        return [{
            method: 'paxos',
            series: this.series[0],
            index: this.index,
            cookie: '0',
            request: [{
                method: 'appoint',
                to: [ indexed.combined[0] ],
                majority: indexed.combined
            }],
            response: [{
                method: 'majority',
                to: indexed.to,
                majority: to
            }, {
                method: 'majority',
                to: indexed.difference,
                majority: difference
            }]
        }, {
            method: 'paxos',
            series: this.series[0],
            index: this.index,
            cookie: '0',
            request: [{
                method: 'appoint',
                to: [ indexed.to[0] ],
                majority: indexed.to
            }],
            response: [{
                method: 'resume',
                to: indexed.to
            }]
        }]
    }

    reinstate (options) {
        const instances = options.instances.concat(options.instances)
        const majority = this.majority.map(promise => ({ promise, index: this.index }))
        return [{
            method: 'paxos',
            series: this.series[0],
            index: this.index,
            cookie: '0',
            request: [{
                method: 'appoint',
                to: [ majority[0] ],
                majority: majority
            }],
            response: []
        }]
    }

    depart (promise) {
        this.departed = this.departed.concat(promise)
        const reduced = this.majority.filter(promise => ! this.departed.includes(promise))
        const majority = reduced.map(promise => ({ promise, index: this.index }))
        const appointments = []
        if (reduced.length != this.majority.length && reduced[0] == this.promise) {
            appointments.push({ index: this.index, majority: majority })
        }
        return {
            appointments: appointments,
            response: [{
                method: 'resume',
                to: [ majority[0] ]
            }]
        }
    }

    indexed (instances) {
        return this.majority
            .map(promise => instances.findIndex(promises => promises.includes(promise)))
            .map(index => instances[index][0])
    }

    replace (options) {
        const indexed = this.indexed(options.instances)
        const reduced = this.majority.filter(promise => ! this.departed.includes(promise))
        if (! Bucket.equal(reduced, indexed) && reduced[0] == this.promise) {
            return this.migrate(options)
        }
    }

    response (message) {
        assert.equal(message.method, 'majority', 'unexpected message')
        this.majority = message.majority
    }
}

module.exports = Bucket
