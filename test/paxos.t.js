require('proof')(6, prove)

async function test (okay, routers) {
    // const outboxes = routers.map(router => router.outboxes().map(outbox => outbox.shifter().sync))
    const entries = routers.map(router => router.entries().map(entries => entries.shifter()))
    const snapshots = routers.map(router => router.snapshots().map(snapshot => snapshot.shifter()))
    routers[0].bootstrap(0, [ 0, 0, 0, 0, 0, 0, 0, 0 ])
    okay(await entries[0][0].shift(), {
        isGovernment: true,
        promise: '1/0',
        body: {
            promise: '1/0',
            majority: [ 0 ],
            minority: [],
            constituents: [],
            acclimate: 0,
            arrive: { id: 0, properties: {}, cookie: 0 },
            arrived: {
                promise: { '0': '1/0' }, id: { '1/0': 0 }
            }
        }
    }, 'bootstrapped')
    routers[0].enqueue(0, { key: 1, value: 'a' })
    // routers[1].route([ 0, 1 ], [ 1, 1, 1, 1, 0, 0, 0, 0 ])
    // routers[1].route([ 0, 1 ], [ 1, 1, 1, 1, 0, 0, 0, 0 ])
    okay(await entries[0][4].shift(), {
        isGovernment: true,
        promise: '1/0',
        body: {
            promise: '1/0',
            majority: [ 0 ],
            minority: [],
            constituents: [],
            acclimate: 0,
            arrive: { id: 0, properties: {}, cookie: 0 },
            arrived: {
                promise: { '0': '1/0' }, id: { '1/0': 0 }
            }
        }
    }, 'bootstrapped 4')
    okay(await entries[0][4].shift(), {
        isGovernment: false,
        promise: '1/1',
        body: { key: 1, value: 'a' },
    }, 'enqueue 4')
    routers[1].join('1/0', [ 0, 0, 0, 0, 0, 0, 0, 0 ])
    routers[0].arrive('2/0', [ 0, 1 ], [ 1, 1, 1, 1, 0, 0, 0, 0 ])
    okay(await snapshots[0][4].shift(), {
        method: 'snapshot',
        to: [ 1 ],
        bucket: 4,
        promise: '1/1'
    }, 'snapshot 1 4')
    routers[0].enqueue(0, { key: 1, value: 'b' })
    okay(await entries[0][4].shift(), {
        isGovernment: false,
        promise: '1/2',
        body: { key: 1, value: 'b' },
    }, 'enqueue 4')
    await routers[0].snapshotted(4, '1/1')
    okay(await entries[1][4].shift(), {
        isGovernment: false,
        promise: '1/2',
        body: { key: 1, value: 'b' }
    }, 'enqueue 4')
}

async function prove (okay) {
    const Queue = require('avenue')
    const Destructible = require('destructible')
    const Cubbyhole = require('cubbyhole')
    const Keyify = require('keyify')
    const assert = require('assert')

    function extractor (object) {
        return object.key
    }

    class Transport {
        constructor () {
            this._sempahores = { send: {}, synchronize: {} }
        }

        async wait (loop, address, bucket) {
            const semaphores = this._sempahores[loop]
            if (semaphores[address] == null) {
                semaphores[address] = {}
            }
            assert(semaphores[address][bucket] == null)
            return new Promise(resolve => semaphores[address][bucket] = resolve)
        }

        notify (loop, address, bucket) {
            const semaphores = this._sempahores[loop]
            if (semaphores[address] != null && semaphores[address][bucket] != null) {
                const resolve = semaphores[address][bucket]
                delete semaphores[address][bucket]
                resolve()
            }
        }

        send (envelope) {
            const responses = {}
            for (const to of envelope.to) {
                routers[to].receive(envelope.bucket, envelope.messages)
                responses[to] = true
            }
            return responses
        }
    }

    const transport = new Transport

    const destructible = new Destructible('test/paxos.t')

    const Router = require('../router')
    const routers = []
    for (let i = 0; i < 3; i++) {
        routers.push(new Router(destructible.durable([ 'router', i ]), extractor, transport, 8, i))
    }
    destructible.durable('test', test(okay, routers))
    await destructible.destructed
}
