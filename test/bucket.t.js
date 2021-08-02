require('proof')(2, okay => {
    const { Bucket } = require('../bucket')
    const bucket = new Bucket(0)
    okay(bucket.promise, null, 'null bucket promise')
    okay(bucket.majority, null, 'null bucket majority')
    bucket.bootstrap('1/0', [ 0 ])
    bucket.complete('1/0')
})
