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
        this.messages = []
        this.buckets = []
        this.cookie = 0n
        this.distribution = { complete: true, to: [] }
        this.configure({ active, ratio })
        this.events = new Queue
    }

    configure (configuration) {
        this.active = coalesce(configuration.active, this.active)
        this.ratio = coalesce(configuration.ratio, this.ratio)
    }

    check () {
        if (this.messages.length != 0) {
            if (this.messages[0].cookie == '0') {
                this.messages[0].cookie = String(++this.cookie)
                this.events.push(this.messages[0])
            }
        } else if (this.arrivals.length != 0) {
            if (this.instances.length == 0) {
                this.instances.push([ this.arrivals.shift() ])
                this.buckets = [ new Bucket(this.series, this.promise, 0, 3) ]
                this.check()
            } else if (this.departed.length != 0) {
            }
        } else if (this.departed.length == 0) {
            if (this.buckets[0].majority.length == 0) {
                this.messages.push.apply(this.messages, this.buckets[0].bootstrap({ instances: this.instances, buckets: [ 0 ] }))
                this.check()
            } else if (this.buckets[this.buckets.length - 1].majority.length == 0) {
                for (let i = this.buckets.length - 1; this.buckets[i - 1].majority.length == 0; i--) {
                    i--
                }
                for (I = this.buckets.length; i < I; i++) {
                    const index = i - this.buckets.length / 2
                    // TODO Rewrite `Bucket.expand` to simply duplicate its majority.
                    this.buckets[index].expand(this.instances)
                }
            } else if (this.instances.length < this.active) {
                this.instances.push([ this.arrivals.shift() ])
                if (this.buckets < this.ratio * this.instances.length) {
                     const { majoritySize, promise } = this.buckets[0]
                     const append = this.buckets.map((_, index) => new Bucket(this.series, this.promise, index + this.buckets.length, majoritySize))
                     this.buckets = this.buckets.concat(append)
                     this.check()
                }
            }
        }
    }

    get status () {
        return {
            arrivals: this.arrivals.slice(0),
            instances: this.instances.slice(0),
            departed: this.departed.slice(0),
            buckets: this.buckets.map(bucket => bucket.status)
        }
    }

    snapshot () {
        return {
            series: this.series.slice(0),
            arrivals: this.arrivals.slice(0),
            instances: this.instances.slice(0),
            departed: this.departed.slice(0),
            buckets: this.buckets.map(bucket => bucket.majority)
        }
    }

    join (snapshot, promise) {
        this.series = snapshot.series
        this.arrivals = snapshot.arrivals
        this.instances = snapshot.instances
        this.departed = snapshot.departed
        this.buckets = snapshot.buckets.map(majority => new Bucket(this.series, promise, 0, 3, majority, snapshot.departed))
    }

    arrive (promise, leader) {
        if (this.promise == null) {
            this.promise = promise
        }
        if (this.promise == leader) {
            this.leader = true
        }
        this.arrivals.push(promise)
        this.check()
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
        this.check()
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

    complete (dispatch) {
        const index = dispatch.index + 1
        if (index < this.buckets.length) {
        }
    }
}

module.exports = Distributor
