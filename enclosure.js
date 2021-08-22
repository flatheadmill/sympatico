// Enclosure is a working name.
class Enclosure {
    constructor () {
    }

    distribute (distribution) {
        this.index = 0
        this.distribution = distribution
    }

    advance () {
        this.buckets[this.index++].advance(this.distribution)
    }
}

module.exports = Enclosure
