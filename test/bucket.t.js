require('proof')(12, async okay => {
    const Bucket = require('../bucket')
    {
        const bucket = new Bucket('1/0', 0, 3)
        okay(bucket.majority, [], 'null bucket majority')
        const shifter = bucket.events.shifter().sync
        // Single element bootstrap.
        {
            bucket.distribution({
                promise: '1/0',
                from: { instances: [], buckets: [] },
                to: { instances: [[ '1/0' ]], buckets: [ 0 ] },
                departed: []
            })
            const dispatch = shifter.shift()
            okay(dispatch, {
                method: 'paxos',
                request: [{
                    method: 'bootstrap',
                    promise: '1/0',
                    to: [{ promise: '1/0', index: 0 }],
                    majority: [{ promise: '1/0', index: 0 }]
                }],
                response: [{
                    method: 'collapse',
                    promise: '1/0',
                    to: [{ promise: '1/0', index: 0 }],
                    majority: [{ promise: '1/0', index: 0 }]
                }]
            }, 'bootstrap')
            bucket.response(dispatch.response[0])
        }
        // Expansion.
        {
            bucket.distribution({
                promise: '2/0',
                to: { instances: [[ '1/0' ], [ '2/0' ]], buckets: [ 0, 0 ] },
                from: { instances: [[ '1/0' ]], buckets: [ 0 ] },
                departed: []
            })
            {
                const dispatch = shifter.shift()
                okay(dispatch, {
                    method: 'paxos',
                    series: 0,
                    request: [{
                        method: 'appoint',
                        to: [{ promise: '1/0', index: 0 }],
                        majority: [{ promise: '1/0', index: 0 }, { promise: '2/0', index: 0 }, { promise: '1/0', index: 1 }, { promise: '2/0', index: 1 }]
                    }],
                    response: [{
                        method: 'replicated',
                        to: [{ promise: '1/0', index: 0 }],
                        majority: [{ promise: '1/0', index: 0 }, { promise: '2/0', index: 0 }, { promise: '1/0', index: 1 }, { promise: '2/0', index: 1 }]
                    }, {
                        method: 'collapse',
                        to: [{ promise: '2/0', index: 0 }],
                        majority: [{ promise: '1/0', index: 0 }, { promise: '2/0', index: 0 }]
                    }, {
                        method: 'collapse',
                        to: [{ promise: '1/0', index: 1 }, { promise: '2/0', index: 1 }],
                        majority: [{ promise: '1/0', index: 1 }, { promise: '2/0', index: 1 }]
                    }]
                }, 'replicated')
                bucket.response(dispatch.response[0])
            }
            {
                const dispatch = shifter.shift()
                okay(dispatch, {
                    method: 'paxos',
                    series: 0,
                    request: [{
                        method: 'appoint',
                        to: [{ promise: '1/0', index: 0 }],
                        majority: [{ promise: '1/0', index: 0 }, { promise: '2/0', index: 0 }]
                    }, {
                        method: 'appoint',
                        to: [{ promise: '1/0', index: 1 }],
                        majority: [{ promise: '1/0', index: 1 }, { promise: '2/0', index: 1 }]
                    }],
                    response: [{
                        method: 'collapse',
                        to: [{ promise: '1/0', index: 0 }],
                        majority: [{ promise: '1/0', index: 0 }, { promise: '2/0', index: 0 }]
                    }, {
                        method: 'collapse',
                        to: [{ promise: '1/0', index: 1 }],
                        majority: [{ promise: '1/0', index: 1 }, { promise: '2/0', index: 1 }]
                    }]
                }, 'expanded')
                bucket.response(dispatch.response[0])
            }
            okay(shifter.shift(), null, 'expansion complete')
        }
        // Redistribution.
        {
            bucket.distribution({
                promise: '3/0',
                from: { instances: [[ '1/0' ], [ '2/0' ]], buckets: [ 0, 0 ] },
                to: { instances: [[ '1/0' ], [ '2/0' ]], buckets: [ 1, 0 ] },
                departed: []
            })
            {
                const dispatch = shifter.shift()
                okay(dispatch, {
                    method: 'paxos',
                    series: 0,
                    request: [{
                        method: 'appoint',
                        to: [{ promise: '1/0', index: 0 }],
                        majority: [{ promise: '1/0', index: 0 }, { promise: '2/0', index: 0 }]
                    }],
                    response: [{
                        method: 'expanded',
                        to: [{ promise: '1/0', index: 0 }],
                        majority: [{ promise: '1/0', index: 0 }, { promise: '2/0', index: 0 }]
                    }, {
                        method: 'collapse',
                        to: [{ promise: '2/0', index: 0 }],
                        majority: [{ promise: '2/0', index: 0 }, { promise: '1/0', index: 0 }]
                    }]
                }, 'expand')
                bucket.response(dispatch.response[0])
            }
            {
                const dispatch = shifter.shift()
                okay(dispatch, {
                    method: 'paxos',
                    series: 0,
                    request: [{
                        method: 'appoint',
                        to: [{ promise: '2/0', index: 0 }],
                        majority: [{ promise: '2/0', index: 0 }, { promise: '1/0', index: 0 }]
                    }],
                    response: [{
                        method: 'collapse',
                        to: [{ promise: '2/0', index: 0 }, { promise: '1/0', index: 0 }],
                        majority: [{ promise: '2/0', index: 0 }, { promise: '1/0', index: 0 }]
                    }]
                }, 'expanded')
                bucket.response(dispatch.response[0])
            }
        }
        // Departure.
        {
            bucket.depart('2/0')
            const dispatch = shifter.shift()
            okay(dispatch, {
                method: 'depart',
                series: 0,
                request: [{
                    method: 'appoint',
                    to: [{ promise: '1/0', index: 0 }],
                    majority: [{ promise: '1/0', index: 0 }]
                }],
                response: [{
                    method: 'collapse',
                    to: [],
                    majority: [{ promise: '1/0', index: 0 }]
                }]
            }, 'depart')
            okay(! bucket.stable, 'unstable after depart')
        }
        // Restoration.
        {
            bucket.distribution({
                from: { instances: [[ '1/0' ], [ '2/0' ]], buckets: [ 1, 0 ] },
                to: { instances: [[ '1/0' ], [ '3/0', '2/0' ]], buckets: [ 1, 0 ] },
            })
            const dispatch = shifter.shift()
            okay(dispatch, {
                method: 'paxos',
                series: 0,
                request: [{
                    method: 'appoint',
                    to: [{ promise: '1/0', index: 0 }],
                    majority: [{ promise: '1/0', index: 0 }, { promise: '3/0', index: 0 }]
                }],
                response: [{
                    method: 'collapse',
                    to: [{ promise: '1/0', index: 0 }, { promise: '3/0', index: 0 }],
                    majority: [{ promise: '3/0', index: 0 }, { promise: '1/0', index: 0 }]
                }]
            }, 'restore')
            bucket.response(dispatch.response[0])
            okay(bucket.stable, 'stabilized after restoration')
        }
    }
    {
        const bucket = new Bucket('2/0', 1, 3)
        const shifter = bucket.events.shifter().sync
        bucket.response({
            method: 'collapse',
            to: [{ promise: '2/0', index: 0 }],
            majority: [{ promise: '2/0', index: 0 }, { promise: '1/0', index: 0 }]
        })
        bucket.depart('1/0')
        {
            const dispatch = shifter.shift()
            okay(shifter.shift(), null, 'would not collapse')
        }
    }
})
