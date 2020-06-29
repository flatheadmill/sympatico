require('proof')(2, prove)

function prove (okay) {
    const Consensus = require('../redux')
    const nodes = (new Array(5).fill(null)).map((_, index) => new Consensus(index))
    const pulses = nodes.map(node => node.outbox.pulse.shifter().sync)
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
            method: 'write',
            body: {
                method: 'government',
                promise: '1/0',
                series: '1',
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
    console.log(shift)
    nodes[0].enqueue(1)
    nodes[0].enqueue(2)
    nodes[0].appoint('2/0', [ 0, 1 ])
}
