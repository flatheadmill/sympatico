const Conference = require('conference')
const Distributor = require('./distributor')
const { Queue } = require('avenue')

class Controller {
    constructor ({ active = Number.MAX_SAFE_INTEGER, ratio = 3 } = {}) {
        this.distributor = new Distributor({ active, ratio })
        this.conference = new Conference
        this.events = new Queue
        this._snapshots = {}
    }

    initialize (compassion) {
        this.compassion = compassion
    }

    async bootstrap () {
    }

    async snapshot ({ queue, promise }) {
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
        console.log(arrival, government)
    }

    async acclimated ({ promise }) {
        console.log('DID ACCLIMATE')
        delete this._snapshots[promise]
        this.events.push({ method: 'acclimated' })
    }
}

module.exports = Controller
