const assert = require('assert')

// Return the first value that is not null-like.
const { coalesce } = require('extant')

// An async/await multiplexed event queue.
const { Queue } = require('avenue')

const Bucket = require('./bucket')

const redistribute = require('./redistribute')

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
        // Remove any old instances no longer referenced by any of the buckets.
        for (const instances of this.instances) {
            let i = 1
            while (i < instances.length) {
                let found = false
                for (const bucket of this.buckets) {
                    if (bucket.majority.includes(instances[i])) {
                        found = true
                        break
                    }
                }
                if (!found) {
                    instances.splice(i, 1)
                } else {
                    i++
                }
            }
        }
        // Check internal message queue. Send message if one is waiting. Do
        // nothing if one is in flight.
        if (this.messages.length != 0) {
            if (this.messages[0].cookie == '0') {
                this.messages[0].cookie = String(++this.cookie)
                if (this.leader) {
                    this.events.push(this.messages[0])
                }
            }
        // Here is where we would migrate from an outgoing instance to an
        // incoming instance.
        } else if (this.instances.some(promises => promises.length > 1)) {
            throw new Error
        // Departed. TBD.
        } else if (this.departed.length != 0) {
            // It may or many not be done here, or in a depart function, but
            // once departure is complete we need to run though all the buckets
            // and appoint their stated majorities. The stated majority is a
            // fallback majority. The actual appointed majority may be a
            // combined transitional majority. We could check for this
            // discrepancy but I'm enjoying the not knowing of this
            // implementation. Sadly, we also have to purge after a restoration
            // since we won't know if the bucket was in a process of splitting.
            // Well, it would only be the last instance before any uninitialized
            // buckets, so there will always be a bucket that is getting told to
            // purge itself after every recovery from departure.
            if (this.arrivals.length != 0) {
                const departed = this.departed.shift()
                const index = this.instances.findIndex(promises => promises.includes(departed))
                this.instances.unshift(this.arrivals.shift())
                this.check()
            }
        } else if (this.reinstate) {
            for (const bucket of this.buckets) {
                this.messages.push.apply(this.messages, bucket.reinstate({ instances: this.instances }))
            }
        // No exsting instances means we are bootstrapping, create a single
        // bucket bucket array.
        } else if (this.instances.length == 0) {
            this.instances.push([ this.arrivals.shift() ])
            this.buckets = [ new Bucket(this.series, this.promise, 0, 3) ]
            this.events.push({ method: 'expand', length: this.buckets.length })
            this.check()
        // Check for uninitialized buckets.
        } else if (this.buckets.length != 0 && this.buckets[this.buckets.length - 1].majority.length == 0) {
            // The uninitalized bucket is the bootstrap.
            if (this.buckets.length == 1) {
                this.messages.push.apply(this.messages, this.buckets[0].bootstrap({ instances: this.instances, buckets: [ 0 ] }))
                this.check()
            } else {
                const indexed = []
                for (let i = 0; i < 2; i++) {
                    for (const bucket of this.buckets.slice(0, this.buckets.length / 2)) {
                        indexed.push(this.instances.findIndex(promises => promises.includes(bucket.majority[0])))
                    }
                }
                let i
                for (i = this.buckets.length - 1; this.buckets[i - 1].majority.length == 0; i--) {
                }
                for (let I = this.buckets.length; i < I; i++) {
                    const index = i - this.buckets.length / 2
                    // TODO Rewrite `Bucket.expand` to simply duplicate its majority.
                    this.messages.push.apply(this.messages, this.buckets[index].expand({ instances: this.instances, buckets: indexed }))
                }
                this.check()
            }
        } else if (this.arrivals.length != 0) {
            if (this.instances.length + 1 < this.active && this.arrivals.length != 0) {
                if (this.buckets.length < this.ratio * this.instances.length + 1) {
                     const { majoritySize, promise } = this.buckets[0]
                     const append = this.buckets.map((_, index) => new Bucket(this.series, this.promise, index + this.buckets.length, majoritySize))
                     this.buckets = this.buckets.concat(append)
                     this.events.push({ method: 'expand', length: this.buckets.length })
                     this.check()
                } else {
                    this.instances.push([ this.arrivals.shift() ])
                    this.check()
                }
            }
        } else {
            const indexed = []
            for (const bucket of this.buckets) {
                indexed.push(this.instances.findIndex(promises => promises.includes(bucket.majority[0])))
            }
            const balanced = redistribute(this.instances.length, indexed)
            if (! balanced.every((element, index) => element = indexed[index])) {
                for (const bucket of this.buckets) {
                }
            }
        }
    }

    get status () {
        return {
            promise: this.promise,
            arrivals: this.arrivals.slice(0),
            instances: this.instances.slice(0),
            departed: this.departed.slice(0),
            buckets: this.buckets.map(bucket => bucket.majority)
        }
    }

    snapshot () {
        return {
            series: this.series.slice(0),
            cookie: String(this.cookie),
            arrivals: this.arrivals.slice(0),
            instances: this.instances.slice(0),
            departed: this.departed.slice(0),
            buckets: this.buckets.map(bucket => bucket.majority)
        }
    }

    join (snapshot, promise) {
        this.series = snapshot.series
        this.cookie = BigInt(snapshot.cookie),
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

    // We can implement rolling restarts using replace. TODO Replacement takes
    // precedent over all operations... Should it take precedent over departure
    // handing and should it be able to run on an instance that is departed?
    replace (promise) {
        if (this.arrivals.length == 0) {
            return false
        }
        // We might not actually be running a phaser.
        const index = this.instances.findIndex(promises => promises.includes(promise))
        if (index != -1) {
            this.instances[index].unshift(this.arrivals.shift())
            this.check()
        } else {
            const index = this.arrivals.indexOf(promise)
            assert(index != null, 'unknown promise')
            this.arrivals.splice(index, 1)
        }
        return true
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
                assert.equal(message.cookie, this.messages[0].cookie, 'cookie mismatch')
                this.messages.shift()
                for (const response of message.response) {
                    for (const to of response.to) {
                        if (to.promise == this.promise || to.promise == '0/0') {
                            if (response.method == 'majority') {
                                this.buckets[to.index].response(response)
                            }
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

    depart (promise) {
        // Track departed member.
        this.departed.push(promise)
        // Increment the series. Messages arriving with any previous series
        // number are ignored and dropped.
        this.series[0]++
        // If the last message was a purge, we preserve it because it will be
        // necessary to perform the purge on the departed fallback.
        const response = this.messages.slice(0, 1).map(message => {
            return message.responses.map(response => response.method == 'purge')
        }).flat(1)
        // For each bucket gather the specific appointments that will be
        // performed immediately by the instance that is the leader for the
        // bucket and the responses that will be added to a pseudo paxos message
        // and identical across all instances.
        const appoitments = []
        for (const bucket of this.buckets) {
            const departure = buckets.depart(promise)
            appointments.push.apply(departures, departure.appointments)
            responses.push.apply(responses, departure.responses)
        }
        const cookie = String(++this.cookie)
        this.messages = [{
            method: 'paxos',
            series: this.series[0],
            cookie: cookie,
            request: [],
            response: response
        }]
        return appointments
    }

    complete (dispatch) {
        const index = dispatch.index + 1
        if (index < this.buckets.length) {
        }
    }
}

module.exports = Distributor
