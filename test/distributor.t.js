require('proof')(5, okay => {
    const Distributor = require('../distributor')

    // Default construtor, won't be used though.
    {
        const distributor = new Distributor
        okay(distributor.ratio, 1, 'default ratio')
        okay(distributor.active, Number.MAX_SAFE_INTEGER, 'default active')
    }

    const distributor = new Distributor({ active: 3, ratio: 4 })

    const shifter = distributor.events.shifter().sync

    okay(distributor.ratio, 4, 'constructor ratio')
    okay(distributor.active, 3, 'constructor maximum')

    distributor.arrive('1/0')

    okay(shifter.shift(), {
        method: 'paxos',
        request: [{
            method: 'bootstrap',
            to: [{ promise: '1/0', index: 0 }],
            majority: [{ promise: '1/0', index: 0 }],
        }],
        response: [{
            method: 'majority',
            to: [{ promise: '1/0', index: 0 }],
            majority: [{ promise: '1/0', index: 0 }],
        }]
    }, 'arrive')

    distributor.complete('1/0')
})
