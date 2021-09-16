const assert = require('assert')

const { Queue } = require('avenue')

function stabilize (bucket, message) {
    assert.equal(message.method, 'collapse', 'unexpected message')
    return new Bucket.Stable(bucket, message.majority)
}

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

    static Strategy = class {
        constructor (bucket, majority, departed) {
            this.bucket = bucket
            this.majority = majority
            this.departed = departed
            this.stable = false
        }

        depart (promise) {
            const departed = this.departed.concat(promise)
            const reduced = this.majority.filter(address => !~departed.indexOf(address.promise))
            if (reduced.length != this.majority.length) {
                if (reduced[0].promise == this.bucket.promise) {
                    return new Bucket.Departure(this.bucket, reduced, departed)
                }
                return new Bucket.Departed(this.bucket, reduced, departed)
            }
            return this
        }

        restore (instances) {
            return this
        }

        response (message) {
            assert.equal(message.method, 'collapse', 'unexpected message')
            return new Bucket.Stable(this.bucket, message.majority)
        }
    }

    static Departed = class extends Bucket.Strategy {
        constructor (bucket, majority, departed) {
            super(bucket, majority, departed)
        }

        distribution (distribution) {
            const instances = distribution.to.instances.concat(distribution.to.instances)
            const index = distribution.to.buckets[this.bucket.index]
            const size = Math.min(distribution.to.instances.length, this.bucket.majoritySize)
            const majority = instances.slice(index, index + size)
                                      .filter(promise => !~this.departed.indexOf(promise))
                                      .map(promise => { return { promise: promise[0], index: this.bucket.index } })
            if (majority.length == size) {
                this.restoration = majority
            }
            if (! Bucket.equal(majority, this.majority)) {
                const combined = this.majority.map(address => address.promise).concat(majority.map(address => address.promise))
                const deduped = combined.filter((promise, index) => combined.indexOf(promise) == index).map(promise => {
                    return { promise, index: this.bucket.index }
                })
                this.bucket.events.push({
                    method: 'paxos',
                    series: 0,
                    request: [{
                        method: 'appoint',
                        to: [ deduped[0] ],
                        majority: deduped
                    }],
                    response: [{
                        method: 'collapse',
                        to: deduped,
                        majority: majority
                    }]
                })
            }
            return this
        }

        response (message) {
            switch (message.method) {
            case 'collapse': {
                    if (Bucket.equal(this.restoration, message.majority)) {
                        return new Bucket.Stable(this.bucket, message.majority)
                    }
                    return new Bucket.Departed(this.bucket, message.majority, this.departed)
                }
            }
            return this
        }
    }

    static Departure = class extends Bucket.Departed {
        constructor (bucket, majority, departed) {
            super(bucket, majority, departed)
            this.restoration = [{ promise: '0/0', index: 1 }]
            this.bucket.events.push({
                method: 'depart',
                series: 0,
                request: [{
                    method: 'appoint',
                    to: [ majority[0] ],
                    majority: majority
                }],
                response: [{
                    method: 'collapse',
                    to: majority.slice(1),
                    majority: majority
                }]
            })
        }
    }

    static Bootstrap = class extends Bucket.Strategy {
        constructor (bucket, distribution) {
            super(bucket, [], [])
            const instances = distribution.to.instances.concat(distribution.to.instances)
            const index = distribution.to.buckets[bucket.index]
            this.step = 0
            this.majority = instances.slice(index, index + Math.min(distribution.to.instances.length, bucket.majoritySize))
                                     .map(promise => { return { promise: promise[0], index: bucket.index } })
            this.bucket = bucket
            const promise = distribution.promise
            this.bucket.events.push({
                method: 'paxos',
                request: [{
                    method: 'bootstrap',
                    promise: promise,
                    to: [ this.majority[0] ],
                    majority: this.majority.slice()
                }],
                response: this.majority.map(address => {
                    return { method: 'collapse', promise: promise, to: this.majority, majority: this.majority }
                })
            })
        }
    }

    static Stable = class extends Bucket.Strategy {
        constructor (bucket, majority, departed = []) {
            super(bucket, majority, departed)
            this.stable = true
        }

        distribution (distribution) {
            if (this.majority.length == 0) {
                return new Bucket.Bootstrap(this.bucket, distribution)
            } else if (distribution.to.buckets.length > distribution.from.buckets.length) {
                return new Bucket.Expand(this.bucket, this.collapsed, distribution)
            }
            return new Bucket.Migrate(this.bucket, this.majority, distribution)
        }
    }

    static Expand = class extends Bucket.Strategy {
        constructor (bucket, majority, distribution) {
            super(bucket, majority, [])
            this.bucket = bucket
            this.distribution = distribution
            const instances = distribution.to.instances.concat(distribution.to.instances)
            const index = distribution.from.buckets[bucket.index]
            const participants = instances.slice(index, index + Math.min(distribution.to.instances.length, bucket.majoritySize))
            this.left = participants.map(promise => { return { promise: promise[0], index: bucket.index } })
            this.right = participants.map(promise => { return { promise: promise[0], index: bucket.index + distribution.from.buckets.length } })
            // TODO Not right. Perpetuate existing majority.
            this.collapsable = this.left
            // Until the instance count grows to double the majority size, we
            // will have some overlap.
            const combined = this.left.concat(this.right)
            this.state = 'replicating'
            this.bucket.events.push({
                method: 'paxos',
                series: 0,
                request: [{
                    method: 'appoint', majority: combined, to: [ combined[0] ]
                }],
                response: [{
                    method: 'replicated', majority: combined, to: [ combined[0] ]
                }, {
                    method: 'collapse', to: this.left.slice(1), majority: this.left
                }, {
                    method: 'collapse', to: this.right, majority: this.right
                }]
            })
        }

        response (message) {
            switch (message.method) {
            case 'replicated': {
                    this.collapse = this.left
                    this.bucket.events.push({
                        method: 'paxos',
                        series: 0,
                        request: [{
                            method: 'appoint',
                            to: [ this.left[0] ],
                            majority: this.left
                        }, {
                            method: 'appoint',
                            to: [ this.right[0] ],
                            majority: this.right
                        }],
                        response: [{
                            method: 'collapse',
                            to: [ this.left[0] ],
                            majority: this.left
                        }, {
                            method: 'collapse',
                            to: [ this.right[0] ],
                            majority: this.right
                        }]
                    })
                    return this
                }
            default: {
                    return super.response(message)
                }
            }
        }
    }

    static Migrate = class extends Bucket.Strategy {
        constructor (bucket, majority, distribution) {
            super(bucket, majority, distribution)
            const from = majority.map(address => address.promise)
            const instances = distribution.to.instances.concat(distribution.to.instances)
            const index = distribution.to.buckets[bucket.index]
            const to = instances.slice(index, index + Math.min(distribution.to.instances.length, bucket.majoritySize))
                                .map(instance => instance[0])
            const combined = from.concat(to)
            const expanded = combined.filter((promise, index) => combined.indexOf(promise) == index)
                                     .map(promise => { return { promise, index: bucket.index } })
            this.to = to.map(promise => { return { promise, index: bucket.index } })
            this.bucket.events.push({
                method: 'paxos',
                series: 0,
                request: [{
                    method: 'appoint',
                    to: [ expanded[0] ],
                    majority: expanded
                }],
                response: [{
                    method: 'expanded',
                    to: [ expanded[0] ],
                    majority: expanded
                }, {
                    method: 'collapse',
                    to: expanded.slice(1),
                    majority: this.to
                }]
            })
        }

        response (message) {
            switch (message.method) {
            case 'expanded': {
                    this.majority = this.to
                    this.bucket.events.push({
                        method: 'paxos',
                        series: 0,
                        request: [{
                            method: 'appoint',
                            to: [ this.to[0] ],
                            majority: this.to
                        }],
                        response: [{
                            method: 'collapse',
                            to: this.to,
                            majority: this.to
                        }]
                    })
                    return this
                }
            default: {
                    return super.response(message)
                }
            }
        }
    }

    constructor (promise, index, majoritySize) {
        this.promise = promise
        this.index = index
        this.majoritySize = majoritySize
        this.events = new Queue
        this._strategy = new Bucket.Stable(this, [])
    }

    get stable () {
        return this._strategy.stable
    }

    get majority () {
        return this._strategy.majority
    }

    depart (promise) {
        this._strategy = this._strategy.depart(promise)
    }

    distribution (distribution) {
        this._strategy = this._strategy.distribution(distribution)
    }

    response (message) {
        this._strategy = this._strategy.response(message)
    }
}

module.exports = Bucket
