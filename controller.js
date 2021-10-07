const Conference = require('conference')

const Keyify = require('keyify')
const { Queue } = require('avenue')
const { Future } = require('perhaps')

const Distributor = require('./distributor')
const Phaser = require('./phaser')

const fnv = require('./fnv')

class Controller {
    constructor (destructible, application, { active = Number.MAX_SAFE_INTEGER, ratio = 3 } = {}) {
        this.distributor = new Distributor({ active, ratio })
        this.conference = new Conference
        this.application = application
        this.phasers = []
        this.events = new Queue
        this._appointments = {}
        this._hops = []
        this.request = new Queue
        this.response = new Queue
        this.outbox = new Queue
        this.cookie = 0n
        this._snapshots = {}
        destructible.durable('events', async () => {
            const shifter = this.distributor.events.shifter()
            for await (const event of this.distributor.events.shifter()) {
                console.log(event)
                switch (event.method) {
                case 'government': {
                        const response = this._appointments[event.promise.replace(/\/0$/, '')]
                        if (response != null) {
                            response()
                        }
                    }
                    break
                case 'entry': {
                        const entry = event.body
                        console.log(entry)
                        let result = await this.application.write(entry, this.distributor.leader)
                        if (typeof result == 'function') {
                            result = await result()
                        }
                        const future = this._hops[entry.cookie]
                        delete this._hops[entry.cookie]
                        future.resolve(result)
                    }
                    break
                // TODO Determine if you need to enqueue the read messages into the
                // internal write queue. Is it necessary to deal with pauses? When
                // we resume to we enqueue or send out a message to 'rehash' or
                // 'rehop'?
                case 'read': {
                    }
                    break
                case 'write': {
                        // TODO Do we have to rehash? Do we have to check for a rebalance?
                        const index = event.hash % this.phasers.length
                        this.phasers[index].enqueue(event)
                    }
                    break
                case 'expand': {
                        while (this.phasers.length < event.length) {
                            this.phasers.push(new Phaser(this.phasers.length, this.distributor.events, this.outbox))
                        }
                    }
                    break
                case 'paxos': {
                        // TODO
                        event.direction = 'map'
                        this.compassion.enqueue(event)
                    }
                    break
                }
            }
        })
        destructible.destruct(() => this.distributor.events.push(null))
        destructible.durable('outbox', async () => {
            for await (const message of this.outbox.shifter()) {
                let request = message
                while (request != null) {
                    const responses = {}
                    for (const to of request.to) {
                        if (to.promise == this.promise) {
                            // TODO Consider some sort of URL or otherwise parsed format for
                            // addresses used across application. i.e. `2/0?5`
                            // i.e. [ promise, index ] = address.split('?')
                            responses[Keyify.stringify(to)] = this.phasers[to.index].request(JSON.parse(JSON.stringify(request)))
                        } else {
                            throw new Error
                        }
                    }
                    request = this.phasers[message.from].response(message, responses)
                }
            }
        })
        destructible.destruct(() => this.outbox.push(null))
    }

    initialize (compassion) {
        this.compassion = compassion
    }

    hop (method, key, value) {
        const hash = fnv(key)
        const index = hash % this.distributor.buckets.length
        const bucket = this.distributor.buckets[index]
        const promise = bucket.majority[0]
        if (promise != this.promise) {
            return Promise.resolve(promise)
        }
        const cookie = this.promise + '/' + String(this.cookie++)
        const future = this._hops[cookie] = new Future
        this.distributor.events.push({ method, hash, key, value, cookie, future })
        return future.promise
    }

    read (key, value) {
        return this.hop('read', key, value)
    }

    write (key, value) {
        return this.hop('write', key, value)
    }

    where (key) {
        const index = fnv(key) % this.distributor.buckets.length
        const bucket = this.distributor.buckets[index]
        return bucket.majority[0]
    }

    async bootstrap ({ self }) {
        this.promise = self.arrived
    }

    async snapshot ({ self, queue, promise }) {
        this.promise = self.arrived
        queue.push(this._snapshots[promise])
        queue.push(null)
    }

    async join ({ shifter }) {
        const snapshot = await shifter.shift()
        this.conference.join(snapshot.conference)
        this.distributor.join(snapshot.distributor)
        await shifter.shift()
    }

    async arrive ({ arrival, government }) {
        this.conference.arrive(arrival.promise)
        this.distributor.arrive(arrival.promise, government.arrived.promise[government.majority])
    }

    async reduce (reductions) {
        for (const reduction of reductions.filter(reduction => reduction != null)) {
            this.distributor.response(reduction.map)
            for (const response of reduction.map.response) {
                for (const to of response.to) {
                    if (to.promise == '0/0' || to.promise == this.promise) {
                        switch (response.method) {
                        case 'majority': {
                            }
                            break
                        default: throw new Error
                        }
                    }
                }
            }
        }
    }

    async entry ({ promise, self, entry, from }) {
        this.events.push({ method: 'entry', entry })
        switch (entry.direction) {
        case 'map': {
                this.conference.map(entry.cookie, entry)
                const response = () => this.compassion.enqueue({ cookie: entry.cookie, direction: 'reduce' })
                for (const request of entry.request) {
                    for (const to of request.to) {
                        if (self.arrived == to.promise) {
                            switch (request.method) {
                            case 'appoint': {
                                    this._appointments[promise] = response
                                    this.phasers[to.index].appoint(promise, request.majority)
                                }
                                break
                            }
                        }
                    }
                }
                if (this._appointments[promise] == null) {
                    response()
                }
            }
            break
        case 'reduce': {
                this.reduce([ this.conference.reduce(from.arrived, entry.cookie, null) ])
            }
            break
        }
    }

    async acclimated ({ promise }) {
        delete this._snapshots[promise]
        this.events.push({ method: 'acclimated' })
    }
}

module.exports = Controller
