require('proof')(4, prove)

function prove (okay) {
    const Consensus = require('../redux')
    const nodes = (new Array(5).fill(null)).map((_, index) => new Consensus(index))
    const pulses = nodes.map(node => node.outbox.shifter().sync)
    const logs = nodes.map(node => node.log.shifter().sync)

    function send (from, request, to = null) {
        const responses = {}
        for (const index of to || request.to) {
            if (!(index in responses)) {
                responses[index] = nodes[index].request(request)
            }
        }
        from.response(request, responses)
    }

    function sendAll () {
        let advanced = true
        while (advanced) {
            advanced = false
            for (let i = 0, I = nodes.length; i < I; i++) {
                const node = nodes[i]
                for (const request of pulses[i].iterator()) {
                    send(node, request)
                    advanced = true
                }
            }
        }
    }

    nodes[0].appoint('1/0', [ 0 ])
    let shift = pulses[0].shift()
    okay(shift, {
        to: [ 0 ],
        messages: [{
            method: 'reset',
            government: { promise: '0/0', majority: [ 0 ] },
            top: { promise: '0/0', series: '0' },
            arrivals: []
        }, {
            method: 'write',
            body: {
                method: 'government',
                promise: '1/0',
                series: '1',
                stage: 'appoint',
                body: {
                    promise: '1/0',
                    majority: [ 0 ]
                }
            }
        }]
    }, 'government')
    send(nodes[0], shift)
    nodes[0].enqueue(1)
    shift = pulses[0].shift()
    okay(shift, {
        to: [ 0 ],
        messages: [{ method: 'commit', promise: '1/0', series: '1' }]
    }, 'government commit')
    send(nodes[0], shift)
    shift = pulses[0].shift()
    send(nodes[0], shift)
    shift = pulses[0].shift()
    send(nodes[0], shift)
    shift = logs[0].shift()
    shift = logs[0].shift()
    nodes[0].acclimated('1/0')
    sendAll()
    nodes[0].enqueue(1)
    nodes[0].enqueue(2)
    nodes[0].appoint('2/0', [ 0, 1 ])
    sendAll()
    okay([
        logs[1].shift(), logs[1].shift(), logs[1].shift()
    ], [{
        method: 'government',
        promise: '2/0',
        series: '5',
        stage: 'appoint',
        body: { promise: '2/0', majority: [ 0, 1 ] }
    }, {
        method: 'entry',
        promise: '2/0',
        series: '6',
        body: 2
    }, null ], 'shift')
    nodes[0].enqueue(3)
    sendAll()
    nodes[0].acclimated('2/0')
    sendAll()
    okay([
        logs[1].shift(), logs[1].shift(), logs[1].shift()
    ], [{
        method: 'entry',
        promise: '2/0',
        series: '7',
        body: 3
    }, {
        method: 'government',
        promise: '2/0',
        series: '8',
        stage: 'acclimated',
        body: { promise: '2/0', majority: [ 0, 1 ] }
    }, null ], 'shift')
}
