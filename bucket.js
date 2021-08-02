const assert = require('assert')

class Bucket {
    static Null = class {
        constructor () {
            this.promise = null
            this.majority = null
            this.active = false
        }
    }

    static Bootstrap  = class {
        constructor (bucket, promise, majority) {
            this.bucket = bucket
            this.promise = promise
            this.majority = majority.slice()
            this.active = false
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

    constructor (index) {
        this.index = index
        this._strategy = new Bucket.Null
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

exports.Bucket = Bucket

class Table {
}

exports.Table = Table
