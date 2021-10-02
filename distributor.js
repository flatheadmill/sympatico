// Return the first value that is not null-like.
const { coalesce } = require('extant')

// An async/await multiplexed event queue.
const { Queue } = require('avenue')

const Bucket = require('./bucket')

const RBTree = require('bintrees').RBTree

class Distributor {
    constructor ({ active = Number.MAX_SAFE_INTEGER, ratio = 1 } = {}) {
        this.arrivals = []
        this.instances = []
        this.departed = []
        this.series = [ 0 ]
        this.distribution = { complete: true, to: [] }
        this.configure({ active, ratio })
        this.events = new Queue
    }

    configure (configuration) {
        this.active = coalesce(configuration.active, this.active)
        this.ratio = coalesce(configuration.ratio, this.ratio)
    }

    snapshot () {
        return {
            arrivals: this.arrivals.slice(),
            instances: this.instances.slice(),
            departed: this.departed.slice()
        }
    }

    join (snapshot) {
        this.arrivals = snapshot.arrivals
        this.instances = snapshot.instances
        this.departed = snapshot.departed
    }

    arrive (promise, leader) {
        if (this.promise == null) {
            this.promise = promise
        }
        if (this.promise == leader) {
            this.leader = true
        }
        this.arrivals.push(promise)
        // If we see the first promise we are bootstrapping.
        if (promise == '1/0') {
            this.instances.push([ this.arrivals.shift() ])
            this.buckets = [ new Bucket(this.series, this.events, promise, 0, 3) ]
            this.stable = false
            this.buckets[0].distribution(this.distribution = {
                method: 'bootstrap',
                instances: [[ '1/0' ]],
                buckets: [ 0 ],
                departed: []
            })
        } else {
        }
    }

    request (message) {
        switch (message.method) {
        case 'arrive': {
                this.arrive(message.promise, message.leader)
            }
            break
        case 'leader': {
                this.leader == this.promise == message.leader
            }
            break
        case 'paxos': {
                for (const request of message.request) {
                    for (const to of request.to) {
                        if (to.promise == this.promise) {
                            switch (request.method) {
                            case 'appoint': {
                                    console.log('>>>> here')
                                }
                                break
                            }
                        }
                    }
                }
            }
            break
        }
    }

    response (message) {
        switch (message.method) {
        case 'paxos': {
                for (const response of message.response) {
                    for (const to of response.to) {
                        if (to.promise == this.promise) {
                            this.buckets[to.index].response(response)
                        }
                    }
                }
            }
            break
        case 'advance': {
                const index = message.index + 1
                if (index > buckets.length) {
                    this.stable = true
                }
            }
            break
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
