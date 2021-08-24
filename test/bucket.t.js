require('proof')(5, async okay => {
    const Bucket = require('../bucket')
    const bucket = new Bucket(0, 3)
    okay(bucket.promise, null, 'null bucket promise')
    okay(bucket.majority, null, 'null bucket majority')
    const shifter = bucket.events.shifter().sync
    // Single element bootstrap.
    {
        const promise = bucket.distribution({
            promise: '1/0',
            from: { instances: [], majority: [] },
            to: { instances: [ '1/0' ], majority: [ '1/0' ] },
            departed: []
        })
        okay(shifter.shift(), {
            step: 0,
            majority: [ '1/0' ]
        }, 'bootstrap')
        bucket.complete(0)
        await promise
    }
    // Expansion and redistribution.
    {
        const promise = bucket.distribution({
            promise: '2/0',
            to: { instances: [ '1/0', '2/0' ], majority: [ '1/0', '1/0' ] },
            from: { instances: [ '1/0' ], majority: [ '1/0' ] },
            departed: []
        })
        okay(shifter.shift(), {
            method: 'replicate',
            majority: [ '1/0', '2/0' ]
        }, 'replicate')
        bucket.complete('replicate')
        okay(shifter.shift(), {
            method: 'split',
            majority: {
                left: [ '1/0', '2/0' ],
                right: [ '1/0', '2/0' ]
            }
        }, 'split')
        bucket.complete('split')
        await promise
    }
})
