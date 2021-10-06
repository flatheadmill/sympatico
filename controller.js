const Conference = require('conference')

const Keyify = require('keyify')
const { Queue } = require('avenue')

const Distributor = require('./distributor')
const Phaser = require('./phaser')

class Controller {
    constructor (destructible, { active = Number.MAX_SAFE_INTEGER, ratio = 3 } = {}) {
        this.distributor = new Distributor({ active, ratio })
        this.conference = new Conference
        this.phasers = []
        this.events = new Queue
        this._appointments = {}
        this.request = new Queue
        this.response = new Queue
        this.outbox = new Queue
        this._snapshots = {}
        destructible.durable('events', async () => {
            const shifter = this.distributor.events.shifter()
            for await (const event of this.distributor.events.shifter()) {
                console.log('>', event)
                switch (event.method) {
                case 'government': {
                        const response = this._appointments[event.promise.replace(/\/0$/, '')]
                        if (response != null) {
                            response()
                        }
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
                    console.log('?', request)
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
                console.log('--- done ---')
            }
        })
        destructible.destruct(() => this.outbox.push(null))
    }

    initialize (compassion) {
        this.compassion = compassion
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
            for (const response of reduction.map.response) {
                for (const to of response.to) {
                    if (to.promise == '0/0' || to.promise == this.promise) {
                        switch (response.method) {
                        case 'majority': {
                                this.distributor.response(response)
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
