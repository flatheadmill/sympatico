require('proof')(5, okay => {
    const Distributor = require('../distributor')

    // Default construtor, won't be used though.
    {
        const distributor = new Distributor
        okay(distributor.ratio, 1, 'default ratio')
        okay(distributor.maximum, Number.MAX_SAFE_INTEGER, 'default maximum')
    }

    const distributor = new Distributor({ maximum: 3, ratio: 4 })

    const shifter = distributor.distributions.shifter().sync

    okay(distributor.ratio, 4, 'constructor ratio')
    okay(distributor.maximum, 3, 'constructor maximum')

    distributor.arrive('1/0')

    okay(shifter.shift(), {
        promise: '1/0',
        complete: false,
        stablized: null,
        to: [ '1/0' ],
        from: [],
        departed: []
    }, 'arrive')

    distributor.complete('1/0')
})
