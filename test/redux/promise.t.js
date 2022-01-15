require('proof')(4, okay => {
    const Promise = require('../../redux/promise')
    const promise = new Promise(0, { now: () => 0 })

    okay(promise.create(), [ 0, 0 ], 'create')
    okay(Promise.compare([ 0, 0 ], [ 0, 0 ]), 0, 'compare equal')
    okay(Promise.compare([ 1, 0 ], [ 0, 0 ]), 1, 'compare tiemstamp greater than')
    okay(Promise.compare([ 0, 1 ], [ 0, 0 ]), 1, 'compare id greater than')
})
