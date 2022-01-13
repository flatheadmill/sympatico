require('proof')(1, okay => {
    const Promise = require('../../redux/promise')
    const promise = new Promise(0, { now: () => 0 })
    okay(promise, 'required')
})
