require('proof')(2, okay => {
    const Bucket = require('../bucket')
    const bucket = new Bucket(0, 3)
    okay(bucket.promise, null, 'null bucket promise')
    okay(bucket.majority, null, 'null bucket majority')
    bucket.distribution({
        promise: '1/0',
        instances: [ '1/0' ],
        from: [],
        to: [ '1/0' ],
        departed: []
    })
})
