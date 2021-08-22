// Return the first value that is not null-like.
const { coalesce } = require('extant')

// An async/await multiplexed event queue.
const { Queue } = require('avenue')

// Red-black tree for ordered maps.
const RBTree = require('bintrees').RBTree

class Distributor {
    constructor ({ maximum = Number.MAX_SAFE_INTEGER, ratio = 1 } = {}) {
        this.distributions = new Queue
        this.arrivals = []
        this.instances = []
        this.departures = new Set
        this.distribution = { complete: true, to: [] }
        this.configure({ maximum, ratio })
    }

    configure (configuration) {
        this.maximum = coalesce(configuration.maximum, this.maximum)
        this.ratio = coalesce(configuration.ratio, this.ratio)
    }

    arrive (promise) {
        this.arrivals.push(promise)
        if (this.instances.length < this.maximum && this.distribution.complete) {
            this.instances.push(this.arrivals.shift())
            if (this.distribution.to.length == 0) {
                this.distributions.push(this.distribution = {
                    promise: promise,
                    complete: false,
                    stablized: null,
                    to: [ promise ],
                    from: [],
                    departed: []
                })
            } else {
            }
        }
    }

    depart (promise, departed) {
        this.departures.add(departed)
        if (this.distribution.stablized != null) {
            this.distributions.push(this.distribution = {
                promise: promise,
                complete: false,
                stablized: this.distribution.stablized,
                from: null,
                to: null,
                departed: this.distribution.concat(departed)
            })
        } else {
            this.distributions.push(this.distribution = {
                promise: promise,
                complete: false,
                stablized: this.distribution,
                from: null,
                to: null,
                departed: [ departed ]
            })
        }
    }

    complete (promise) {
        if (promise == this.distribution.promise) {
            this.distribution.complete = false
        }
    }
}

module.exports = Distributor
