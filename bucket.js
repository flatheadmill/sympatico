const assert = require('assert')

class Bucket {
    static Idle = class {
        constructor (bucket) {
            this.bucket = bucket
            this.promise = null
            this.majority = null
            this.active = false
        }

        distribution (distribution) {
            assert.equal(distribution.departed.length, 0, 'bootstrapping on departure')
            return new Bucket.Bootstrap(this.bucket, distribution)
        }
    }

    static Bootstrap  = class {
        constructor (bucket, distribution) {
            const instances = distribution.instances.concat(distribution.instances)
            const majority = instances.slice(bucket.index, bucket.index + Math.max(distribution.instances.length, bucket.majoritySize))
            this.bucket = bucket
            this.distribution = distribution
        }

        complete (promise) {
            assert.equal(promise, this.promise)
            return new Bucket.Stable(this.promise, this.majority)
        }

        depart (promise) {
        }
    }

    static Join = class {
        constructor (promise, majority) {
            this.promise = promise
            this.majority = majority
        }
    }

    static Stable = class {
        constructor (promise, majority) {
            this.promise = promise
            this.majority = majority
            this.active = true
        }

        complete () {
            throw new Error
        }
    }

    constructor (index, majoritySize) {
        this.index = index
        this.majoritySize = majoritySize
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
        return this._strategy = this._strategy.distribution(distribution)
    }

    bootstrap (promise, majority) {
        return this._strategy = new Bucket.Bootstrap(this, promise, majority)
    }

    complete (promise) {
        this._strategy = this._strategy.complete(promise)
    }

    expand (majority) {
        assert.equal(majority.filter(address => ~this.majority.indexOf(address)).length, this.majority.length)
    }
}

module.exports = Bucket
