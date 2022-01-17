const Register = require('./register')

class Sympatico {
    constructor (id, publisher) {
        const consumers = []
        this._register = new Register(id, publisher, consumers)
    }

    // TODO We are going to use a method of service discovery to probe endpoints
    // and join which ever assembly is healthy. If we are not able to find a
    // healthy assembly than we will wait until we can receive a definitive
    // answer from every entry in our seed and if they are all unhealthy we will
    // choose to bootstrap with the members that has been running the longest.

    // Perhaps in this case we can run a unanimous paxos of some sort, so that
    // we can be assure that we're not starting a consensus on the oldest and
    // the second oldest.
    bootstrap (leaders) {
        this._register.appoint([ this._id ])
    }

    join () {
    }
}

module.exports = Sympatico
