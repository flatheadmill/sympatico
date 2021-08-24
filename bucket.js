const assert = require('assert')

const { Queue } = require('avenue')

const { Future } = require('perhaps')

class Bucket {
    static Idle = class {
        constructor (bucket) {
            this.bucket = bucket
            this.promise = null
            this.majority = null
            this.active = false
        }

        distribution (distribution, future) {
            assert.equal(distribution.departed.length, 0, 'bootstrapping on departure')
            return new Bucket.Bootstrap(this.bucket, distribution, future)
        }
    }

    static Bootstrap  = class {
        constructor (bucket, distribution, future) {
            const instances = distribution.instances.concat(distribution.instances)
            this.step = 0
            this.majority = instances.slice(bucket.index, bucket.index + Math.min(distribution.instances.length, bucket.majoritySize))
            this.bucket = bucket
            this.future = future
            this.distribution = distribution
            this.bucket.events.push({
                step: this.step++,
                majority: this.majority.slice(0, 1)
            })
        }

        complete (step) {
            assert.equal(step + 1, this.step, 'step out of order')
            if (this.step == this.majority.length) {
                this.future.resolve()
                return new Bucket.Stable(this.bucket)
            }
            const current = this.step++
            this.bucket.events.push({ step: current, majority: this.majority.slice(0, this.step) })
            return this
        }
    }

    static Join = class {
        constructor (promise, majority) {
            this.promise = promise
            this.majority = majority
        }
    }

    static Stable = class {
        constructor (bucket) {
            this.bucket = bucket
        }

        distribution (distribution, future) {
            if (distribution.to.length > distribution.from.length) {
                return new Bucket.Expand(this.bucket, distribution, future)
            }
        }
    }

    static Expand = class {
        constructor (bucket, distribution, future) {
            this.bucket = bucket
            this.distribution = distribution
            this.future = future
            const instances = distribution.instances.concat(distribution.instances)
            this.right = this.left = instances.slice(bucket.index, bucket.index + Math.min(distribution.instances.length, bucket.majoritySize))
            // Until the instance count grows to double the majority size, we
            // will have some overlap.
            const combined = this.left.concat(this.right)
            const majority = combined.filter((promise, index) => combined.indexOf(promise) == index)
            this.bucket.events.push({ method: 'replicate', majority: majority })
        }

        complete (method) {
            switch (method) {
            case 'replicate': {
                    this.bucket.events.push({
                        method: 'split',
                        majority: {
                            left: this.left,
                            right: this.right
                        }
                    })
                    return this
                }
            case 'split': {
                    this.future.resolve()
                    return new Bucket.Stable(this.bucket)
                }
            }
        }
    }

    constructor (index, majoritySize) {
        this.index = index
        this.majoritySize = majoritySize
        this.events = new Queue
        this._strategy = new Bucket.Idle(this)
    }

    get active () {
        return this._strategy.active
    }

    get promise () {
        return this._strategy.promise
    }

    get majority () {
        return this._strategy.majority
    }

    distribution (distribution) {
        const future = new Future
        this._strategy = this._strategy.distribution(distribution, future)
        return future
    }

    bootstrap (promise, majority) {
        return this._strategy = new Bucket.Bootstrap(this, promise, majority)
    }

    complete (step) {
        this._strategy = this._strategy.complete(step)
    }

    expand (majority) {
        assert.equal(majority.filter(address => ~this.majority.indexOf(address)).length, this.majority.length)
    }
}

module.exports = Bucket
