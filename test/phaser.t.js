require('proof')(6, prove)

function prove (okay) {
    const { Queue } = require('avenue')
    const Phaser = require('../phaser')
    const Keyify = require('keyify')
    const nodes = function () {
        const nodes = {}
        for (const phaser of (new Array(5).fill(null)).map((_, index) => new Phaser({ promise: `${index + 1}/0`, index: 0 }, new Queue))) {
            nodes[`${phaser.address.promise}?${phaser.address.index}`] = {
                phaser: phaser,
                pulse: phaser.outbox.shifter().sync,
                log: phaser.log.shifter().sync
            }

        }
        return nodes
    } ()

    function send (from, request, except = []) {
        const responses = {}
        for (const address of request.to) {
            const keyified = `${address.promise}?${address.index}`
            if (!(keyified in responses) && !~except.indexOf(keyified)) {
                responses[keyified] = nodes[keyified].phaser.request(JSON.parse(JSON.stringify(request)))
            }
        }
        from.phaser.response(request, responses)
    }

    function sendAll (except = []) {
        let advanced = true
        while (advanced) {
            advanced = false
            for (const address in nodes) {
                const node = nodes[address]
                for (const request of node.pulse.iterator()) {
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

    nodes['1/0?0'].phaser.appoint('1/1', [{ promise: '1/0', index: 0 }])
    let shift = nodes['1/0?0'].pulse.shift()
    okay(shift, {
        method: 'send',
        address: { promise: '1/0', index: 0 },
        to: [{ promise: '1/0', index: 0 }],
        messages: [{
            method: 'reset',
            government: { promise: '0/0/0', majority: [{ promise: '1/0', index: 0 }] },
            top: { promise: '0/0/0' },
            committed: null,
            register: null,
            arrivals: []
        }, {
            method: 'write',
            to: [{ promise: '1/0', index: 0 }],
            body: {
                method: 'government',
                promise: '1/1/0',
                committed: null,
                stage: 'appoint',
                arrivals: [],
                body: {
                    promise: '1/1/0',
                    majority: [{ promise: '1/0', index: 0 }]
                }
            }
        }]
    }, 'government')
    send(nodes['1/0?0'], shift)
    nodes['1/0?0'].phaser.enqueue(1)
    shift = nodes['1/0?0'].pulse.shift()
    okay(shift, {
        method: 'send',
        to: [{ promise: '1/0', index: 0 }],
        address: { promise: '1/0', index: 0 },
        messages: [{ method: 'commit', promise: '1/1/0' }]
    }, 'government commit')
    send(nodes['1/0?0'], shift)
    okay(nodes['1/0?0'].phaser.government, {
        promise: '1/1/0',
        majority: [{ promise: '1/0', index: 0 }]
    }, 'bootstrapped')
    okay([
        nodes['1/0?0'].log.shift(), nodes['1/0?0'].log.shift(), nodes['1/0?0'].log.shift()
    ], [{
        method: 'reset', address: { promise: '1/0', index: 0 }
    }, {
        method: 'government',
        address: { promise: '1/0', index: 0 },
        stage: 'appoint',
        promise: '1/1/0',
        committed: null,
        arrivals: [],
        body: {
            promise: '1/1/0',
            majority: [{ promise: '1/0', index: 0 }]
        }
    }, null ], 'bootstrap commit')
    nodes['1/0?0'].phaser.resume()
    sendAll()
    okay([
        nodes['1/0?0'].log.shift(), nodes['1/0?0'].log.shift()
    ], [{
        method: 'entry',
        address: { promise: '1/0', index: 0 },
        promise: '1/1/1',
        body: 1
    }, null ], 'single write')
    debugger
    nodes['1/0?0'].phaser.enqueue(2)
    nodes['1/0?0'].phaser.enqueue(3)
    nodes['1/0?0'].phaser.appoint('1/2', [{ promise: '1/0', index: 0 }, { promise: '2/0', index: 0 }])
    sendAll()
    okay([
        nodes['2/0?0'].log.shift(), nodes['2/0?0'].log.shift(), nodes['2/0?0'].log.shift()
    ], [{
        method: 'acclimate',
        address: { promise: '2/0', index: 0 },
        bootstrap: false,
        leader: { promise: '1/0', index: 0 }
    }, {
        method: 'government',
        stage: 'appoint',
        address: { promise: '2/0', index: 0 },
        promise: '1/2/0',
        committed: null,
        arrivals: [{ promise: '2/0', index: 0 }],
        body: { promise: '1/2/0', majority: [{ promise: '1/0', index: 0 }, { promise: '2/0', index: 0 }] }
    }, null ], 'shift')
    return
}
