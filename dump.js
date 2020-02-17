module.exports = function dump (value) {
    console.log(require('util').inspect(value, { depth: null }))
}
