require('proof')(3, prove)

class Network {
    constructor (routers) {
        this.routers = routers
        this.outboxes = routers.map(router => router.outboxes().map(outbox => outbox.shifter().sync))
    }

}

function prove (okay) {
    function extractor (value) {
        return value
    }
    function send (filter = routers.map((_, index) => index)) {
        for (const router in filter) {
            const envelopes = outboxes[router].map(outbox => outbox.shift()).filter(outbox => outbox)
            for (const envelope of envelopes) {
                for (const to of envelope.to) {
                    const split = to.split('/').map(part => +part)
                    envelope.responses[to] = routers[split[0]].receive(split[1], envelope.messages)
                }
                routers[router].sent(envelope)
            }
        }
    }
    const Router = require('../router')
    const routers = []
    for (let i = 0; i < 3; i++) {
        routers.push(new Router(extractor, 8, i))
    }
    const outboxes = routers.map(router => router.outboxes().map(outbox => outbox.shifter().sync))
    const entries = routers.map(router => router.entries().map(entries => entries.shifter().sync))
    routers[0].bootstrap(0, [ 0, 0, 0, 0, 0, 0, 0, 0 ])
    okay(entries[0][0].shift(), {
        isGovernment: true,
        promise: '1/0',
        body: {
            promise: '1/0',
            majority: [ '0/0' ],
            minority: [],
            constituents: [],
            acclimate: '0/0',
            arrive: { id: '0/0', properties: {}, cookie: 0 },
            arrived: {
                promise: { '0/0': '1/0' }, id: { '1/0': '0/0' }
            }
        }
    }, 'bootstrapped')
    routers[0].enqueue(0, 1)
    send()
    send()
    // routers[1].route([ 0, 1 ], [ 1, 1, 1, 1, 0, 0, 0, 0 ])
    // routers[1].route([ 0, 1 ], [ 1, 1, 1, 1, 0, 0, 0, 0 ])
    okay(entries[0][4].shift(), {
        isGovernment: true,
        promise: '1/0',
        body: {
            promise: '1/0',
            majority: [ '0/4' ],
            minority: [],
            constituents: [],
            acclimate: '0/4',
            arrive: { id: '0/4', properties: {}, cookie: 0 },
            arrived: {
                promise: { '0/4': '1/0' }, id: { '1/0': '0/4' }
            }
        }
    }, 'bootstrapped 4')
    okay(entries[0][4].shift(), {
        isGovernment: false,
        promise: '1/1',
        body: 1
    }, 'enqueue 4')
}
