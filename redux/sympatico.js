const { Queue } = require('avenue')

class Sympatico {
    constructor (id, consumer) {
        this.id = id
        this.outbox = new Queue
        this.log = []
        this.consumer = consumer
    }

    appoint (population) {
        // If version equals zero then we are bootstrapping.
        if (population.version == 0n) {
        } else {
        }
    }
}

module.exports = Sympatico
