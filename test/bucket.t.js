require('proof')(7, async okay => {
    const { Queue } = require('avenue')
    const Bucket = require('../bucket')
    {
        const bucket = new Bucket([ 0 ], '1/0', 0, 3)
        okay(bucket.majority, [], 'null bucket majority')
        // Single element bootstrap.
        {
            const dispatch = bucket.bootstrap({ instances: [[ '1/0' ]], buckets: [ 0 ] })
            okay(dispatch, {
                method: 'paxos',
                request: [{
                    method: 'appoint',
                    to: [{ promise: '1/0', index: 0 }],
                    majority: [{ promise: '1/0', index: 0 }]
                }],
                response: [{
                    method: 'majority',
                    to: [{ promise: '1/0', index: 0 }],
                    majority: [ '1/0' ]
                }],
                next: null
            }, 'bootstrap')
            bucket.response(dispatch.response[0])
        }
        // Expansion.
        {
            const dispatch = bucket.expand({ instances: [[ '1/0' ], [ '2/0' ]], buckets: [ 0, 0 ] })
            okay(dispatch, {
                method: 'paxos',
                series: 0,
                index: 0,
                request: [{
                    method: 'appoint',
                    to: [{ promise: '1/0', index: 0 }],
                    majority: [{ promise: '1/0', index: 0 }, { promise: '2/0', index: 0 }, { promise: '1/0', index: 1 }, { promise: '2/0', index: 1 }]
                }],
                response: [{
                    method: 'majority',
                    to: [{ promise: '1/0', index: 0 }, { promise: '2/0', index: 0 }],
                    majority: [ '1/0', '2/0' ]
                }, {
                    method: 'majority',
                    to: [{ promise: '1/0', index: 1 }, { promise: '2/0', index: 1 }],
                    majority: [ '1/0', '2/0' ]
                }],
                next: {
                    method: 'paxos',
                    series: 0,
                    index: 0,
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
                        method: 'purge',
                        series: 0,
                        index: 0,
                        to: [{ promise: '1/0', index: 0 }, { promise: '2/0', index: 0 }, { promise: '1/0', index: 1 }, { promise: '2/0', index: 1 }]
                    }],
                    next: null
                }
            }, 'expand')
            bucket.response(dispatch.response[0])
        }
        // Redistribution.
        {
            const dispatch = bucket.migrate({ instances: [[ '1/0' ], [ '2/0' ]], buckets: [ 1, 0 ] })
            okay(dispatch, {
                method: 'paxos',
                series: 0,
                index: 0,
                request: [{
                    method: 'appoint',
                    to: [{ promise: '1/0', index: 0 }],
                    majority: [{ promise: '1/0', index: 0 }, { promise: '2/0', index: 0 }]
                }],
                response: [{
                    method: 'majority',
                    to: [{ promise: '2/0', index: 0 }, { promise: '1/0', index: 0 }],
                    majority: [ '2/0', '1/0' ]
                }, {
                    method: 'majority',
                    to: [],
                    majority: []
                }],
                next: {
                    method: 'paxos',
                    series: 0,
                    index: 0,
                    request: [{
                        method: 'appoint',
                        to: [{ promise: '2/0', index: 0 }],
                        majority: [{ promise: '2/0', index: 0 }, { promise: '1/0', index: 0 }]
                    }],
                    response: [{
                        method: 'resume',
                        to: [{ promise: '2/0', index: 0 }, { promise: '1/0', index: 0 }],
                    }],
                    next: null
                }
            }, 'migrate')
            bucket.response(dispatch.response[0])
        }
        // Departure.
        {
            const dispatch = bucket.depart('2/0')
            okay(dispatch, { method: 'depart', majority: [{ promise: '1/0', index: 0 }] }, 'depart')
        }
        // Restoration.
        {
            const dispatch = bucket.replace({ instances: [[ '1/0' ], [ '3/0', '2/0' ]], buckets: [ 1, 0 ] })
            okay(dispatch, {
                method: 'paxos',
                series: 0,
                index: 0,
                request: [{
                    method: 'appoint',
                    to: [{ promise: '1/0', index: 0 }],
                    majority: [{ promise: '1/0', index: 0 }, { promise: '3/0', index: 0 }]
                }],
                response: [{
                    method: 'majority',
                    to: [{ promise: '3/0', index: 0 }, { promise: '1/0', index: 0 }],
                    majority: [ '3/0', '1/0' ]
                }, {
                    method: 'majority',
                    to: [],
                    majority: []
                }],
                next: {
                    method: 'paxos',
                    series: 0,
                    index: 0,
                    request: [{
                        method: 'appoint',
                        to: [{ promise: '3/0', index: 0 }],
                        majority: [{ promise: '3/0', index: 0 }, { promise: '1/0', index: 0 }]
                    }],
                    response: [{
                        method: 'resume',
                        to: [{ promise: '3/0', index: 0 }, { promise: '1/0', index: 0 }]
                    }],
                    next: null
                }
            }, 'restore')
            bucket.response(dispatch.response[0])
        }
    }
    {
        const bucket = new Bucket([ 0 ], '2/0', 1, 3)
        bucket.response({
            method: 'majority',
            to: [{ promise: '2/0', index: 0 }],
            majority: [ '1/0', '3/0', '2/0' ]
        })
        const dispatch = bucket.depart('3/0')
        okay(dispatch, null, 'would not collapse')
    }
})
