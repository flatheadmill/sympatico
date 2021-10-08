require('proof')(10, async okay => {
    const { Queue } = require('avenue')
    const Bucket = require('../bucket')
    {
        const bucket = new Bucket([ 0 ], '1/0', 0, 3)
        okay(bucket.majority, [], 'null bucket majority')
        // Single element bootstrap.
        {
            const messages = bucket.bootstrap({ instances: [[ '1/0' ]], buckets: [ 0 ] })
            okay(messages, [{
                method: 'paxos',
                series: 0,
                index: 0,
                cookie: '0',
                request: [{
                    method: 'appoint',
                    to: [{ promise: '1/0', index: 0 }],
                    majority: [{ promise: '1/0', index: 0 }]
                }],
                response: [{
                    method: 'majority',
                    to: [{ promise: '1/0', index: 0 }],
                    majority: [ '1/0' ]
                }, {
                    method: 'resume',
                    to: [{ promise: '1/0', index: 0 }],
                }]
            }], 'bootstrap')
            bucket.response(messages[0].response[0])
        }
        // Expansion.
        {
            const messages = bucket.expand({ instances: [[ '1/0' ], [ '2/0' ]], buckets: [ 0, 0 ] })
            okay(messages, [{
                method: 'paxos',
                series: 0,
                index: 0,
                cookie: '0',
                request: [{
                    method: 'appoint',
                    to: [{ promise: '1/0', index: 0 }],
                    majority: [{ promise: '1/0', index: 0 }, { promise: '2/0', index: 0 }, { promise: '1/0', index: 1 }, { promise: '2/0', index: 1 }]
                }],
                response: [{
                    method: 'majority',
                    to: [{ promise: '0/0', index: 0 }],
                    majority: [ '1/0', '2/0' ]
                }, {
                    method: 'majority',
                    to: [{ promise: '0/0', index: 1 }],
                    majority: [ '1/0', '2/0' ]
                }]
            }, {
                method: 'paxos',
                series: 0,
                index: 0,
                cookie: '0',
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
                    to: [{ promise: '1/0', index: 0 }, { promise: '2/0', index: 0 }, { promise: '1/0', index: 1 }, { promise: '2/0', index: 1 }]
                }],
            }], 'expand')
            bucket.response(messages[0].response[0])
        }
        // Redistribution.
        {
            const messages = bucket.migrate({ instances: [[ '1/0' ], [ '2/0' ]], buckets: [ 1, 0 ] })
            okay(messages, [{
                method: 'paxos',
                series: 0,
                index: 0,
                cookie: '0',
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
            }, {
                method: 'paxos',
                series: 0,
                index: 0,
                cookie: '0',
                request: [{
                    method: 'appoint',
                    to: [{ promise: '2/0', index: 0 }],
                    majority: [{ promise: '2/0', index: 0 }, { promise: '1/0', index: 0 }]
                }],
                response: [{
                    method: 'resume',
                    to: [{ promise: '2/0', index: 0 }, { promise: '1/0', index: 0 }],
                }],
            }], 'migrate')
            bucket.response(messages[0].response[0])
        }
        // Null redistribution.
        {
            const messages = bucket.migrate({ instances: [[ '1/0' ], [ '2/0' ]], buckets: [ 1, 0 ] })
            okay(messages, [], 'already balanced')
        }
        // Departure.
        {
            const dispatch = bucket.depart('2/0')
            okay(dispatch, {
                appointments: [{ index: 0, majority: [{ promise: '1/0', index: 0 }] }],
                response: [{ method: 'resume', to: [{ promise: '1/0', index: 0 }] }]
            }, 'depart')
        }
        // Restoration.
        {
            const messages = bucket.replace({ instances: [[ '1/0' ], [ '3/0', '2/0' ]], buckets: [ 1, 0 ] })
            okay(messages, [{
                method: 'paxos',
                series: 0,
                index: 0,
                cookie: '0',
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
                }]
            }, {
                method: 'paxos',
                series: 0,
                index: 0,
                cookie: '0',
                request: [{
                    method: 'appoint',
                    to: [{ promise: '3/0', index: 0 }],
                    majority: [{ promise: '3/0', index: 0 }, { promise: '1/0', index: 0 }]
                }],
                response: [{
                    method: 'resume',
                    to: [{ promise: '3/0', index: 0 }, { promise: '1/0', index: 0 }]
                }]
            }], 'restore')
            bucket.response(messages[0].response[0])
        }
        // Restoration unnecessary.
        {
            const messages = bucket.replace({ instances: [[ '1/0' ], [ '3/0', '2/0' ]], buckets: [ 1, 0 ] })
            okay(messages, [], 'restoration unnecessary')
        }
        // Reinstatement.
        {
            const messages = bucket.reinstate({ instances: [[ '1/0' ], [ '3/0', '2/0' ]] })
            okay(messages, [{
                method: 'paxos',
                series: 0,
                index: 0,
                cookie: '0',
                request: [{
                    method: 'appoint',
                    to: [{ promise: '3/0', index: 0 }],
                    majority: [{ promise: '3/0', index: 0 }, { promise: '1/0', index: 0 }]
                }],
                response: []
            }], 'reinstate')
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
        okay(dispatch, {
            appointments: [],
            response: [{
                method: 'resume',
                to: [{ promise: '1/0', index: 1 }]
            }]
        }, 'would not collapse')
    }
})
