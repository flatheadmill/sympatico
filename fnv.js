const fnv = require('hash.fnv')
const Keyify = require('keyify')

module.exports = function (value) {
    const buffer = Buffer.from(Keyify.stringify(value))
    return fnv(0, buffer, 0, buffer.length)
}
