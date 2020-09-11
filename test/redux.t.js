require('proof')(11, prove)

function prove (okay) {
    const Consensus = require('../redux')
    const nodes = (new Array(5).fill(null)).map((_, index) => new Consensus(index))
    const pulses = nodes.map(node => node.outbox.shifter().sync)
    const logs = nodes.map(node => node.log.shifter().sync)

    function send (from, request, except = []) {
        const responses = {}
        for (const index of request.to) {
            if (!(index in responses) && !~except.indexOf(index)) {
                responses[index] = nodes[index].request(JSON.parse(JSON.stringify(request)))
            }
        }
        from.response(request, responses)
    }

    function sendAll (except = []) {
        let advanced = true
        while (advanced) {
            advanced = false
            for (let i = 0, I = nodes.length; i < I; i++) {
                const node = nodes[i]
                for (const request of pulses[i].iterator()) {
                    if (request.method == 'send') {
                        send(node, request, except)
                        advanced = true
                    }
                }
            }
        }
    }

    function empty () {
        for (const log of logs) {
            while (log.shift() != null) {
            }
        }
    }

    function splice (node, count) {
        const shifted = []
        while (count-- != 0) {
            shifted.push(logs[node].shift())
        }
        return shifted
    }

    nodes[0].appoint('1/0', [ 0 ])
    let shift = pulses[0].shift()
    okay(shift, {
        method: 'send',
        to: [ 0 ],
        messages: [{
            method: 'reset',
            government: { promise: '0/0', majority: [ 0 ] },
            top: { promise: '0/0', series: '0' },
            previous: null,
            arrivals: []
        }, {
            method: 'write',
            body: {
                method: 'government',
                promise: '1/0',
                previous: null,
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
        method: 'send',
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
        logs[1].shift(), logs[1].shift(), logs[1].shift(), logs[1].shift()
    ], [{
        method: 'acclimate',
        bootstrap: false,
        leader: 0
    }, {
        method: 'government',
        promise: '2/0',
        previous: null,
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
        previous: null,
        series: '8',
        stage: 'acclimated',
        body: { promise: '2/0', majority: [ 0, 1 ] }
    }, null ], 'shift')
    nodes[0].appoint('3/0', [ 0, 1, 2 ])
    sendAll()
    okay([
        logs[1].shift(), logs[1].shift()
    ], [{
        method: 'government',
        stage: 'appoint',
        promise: '3/0',
        series: '9',
        previous: null,
        body: { promise: '3/0', majority: [ 0, 1, 2 ] }
    }, null ], 'shift')
    nodes[0].acclimated('3/0')
    sendAll()
    nodes[0].enqueue(4)
    shift = pulses[0].shift()
    send(nodes[0], shift)
    shift = pulses[0].shift()
    send(nodes[0], shift, [ 1 ])
    okay({
        1: [ logs[1].shift(), logs[1].shift() ]
    }, {
        1: [{
            method: 'government',
            stage: 'acclimated',
            promise: '3/0',
            previous: null,
            series: '10',
            body: { promise: '3/0', majority: [ 0, 1, 2 ] }
        }, null ]
    }, 'abdicate out of sync')
    nodes[1].appoint('4/0', [ 1, 2 ])
    okay(logs[1].shift(), null, 'abdicator behind')
    sendAll()
    okay(nodes[1].paused, 'paused')
    okay(logs[1].shift(), {
        method: 'entry', promise: '3/0', series: '11', body: 4
    }, 'abdicator caught up')
    nodes[1].resume()
    sendAll()
    nodes[1].acclimated('4/0')
    sendAll()
    nodes[1].appoint('5/0', [ 1, 2, 0 ])
    sendAll()
    nodes[1].acclimated('5/0')
    sendAll()
    empty()
    nodes[1].enqueue(5)
    shift = pulses[1].shift()
    send(nodes[1], shift)
    shift = pulses[1].shift()
    send(nodes[1], shift, [ 2 ])
    okay({
        0: splice(0, 2),
        2: splice(2, 1),
    }, {
        0: [{
            method: 'entry',
            promise: '5/0',
            series: '16',
            body: 5
        }, null ],
        2: [ null ]
    }, 'abdicator ahead')
    nodes[0].appoint('6/0', [ 0, 2 ])
    sendAll()
    okay({
        2: splice(2, 3)
    }, {
        2: [{
            method: 'entry',
            promise: '5/0',
            series: '16',
            body: 5
        }, {
            method: 'government',
            stage: 'appoint',
            promise: '6/0',
            previous: null,
            series: '17',
            body: { promise: '6/0', majority: [ 0, 2 ] }
        }, null ]
    }, 'abdicator ahead')
}
