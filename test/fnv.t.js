require('proof')(1, prove)

function prove (okay) {
    const fnv = require('../fnv')
    okay(fnv(1), 873244444, 'fnv')
}
