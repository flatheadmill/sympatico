require('proof')(11, prove)

async function test (okay, routers) {
    // const outboxes = routers.map(router => router.outboxes().map(outbox => outbox.shifter().sync))
    const transitions = routers.map(router => router.transitions.shifter())
    const entries = routers.map(router => router.entries().map(entries => entries.shifter()))
    const snapshots = routers.map(router => router.snapshots().map(snapshot => snapshot.shifter()))
    routers[0].bootstrap(0, [ 0, 0, 0, 0, 0, 0, 0, 0 ])
    okay(await entries[0][0].shift(), {
        isGovernment: true,
        promise: '1/0',
        body: {
            promise: '1/0',
            majority: [ 0 ]
        }
    }, 'bootstrapped')
    await routers[0].enqueue({ key: 1, value: 'a' })
    // routers[1].route([ 0, 1 ], [ 1, 1, 1, 1, 0, 0, 0, 0 ])
    // routers[1].route([ 0, 1 ], [ 1, 1, 1, 1, 0, 0, 0, 0 ])
    okay(await entries[0][1].shift(), {
        isGovernment: true,
        promise: '1/0',
        body: {
            promise: '1/0',
            majority: [ 0 ]
        }
    }, 'bootstrapped 4')
    okay(await entries[0][1].shift(), {
        isGovernment: false,
        promise: '1/1',
        body: { key: 1, value: 'a' },
    }, 'enqueue 4')
    routers[1].join('1/0', [ 0, 0, 0, 0, 0, 0, 0, 0 ])
    routers[0].arrive('2/0', [ 0, 1 ], [ 1, 1, 1, 1, 0, 0, 0, 0 ])
    okay(await snapshots[0][1].shift(), {
        method: 'snapshot',
        to: [ 1 ],
        bucket: 1,
        promise: '1/1'
    }, 'snapshot 1 4')
    await routers[0].enqueue({ key: 1, value: 'b' })
    okay(await entries[0][1].shift(), {
        isGovernment: false,
        promise: '1/2',
        body: { key: 1, value: 'b' },
    }, 'enqueue 0 1 4')
    await routers[0].snapshotted(1, '1/1')
    okay(await entries[1][1].shift(), {
        isGovernment: false,
        promise: '1/2',
        body: { key: 1, value: 'b' }
    }, 'enqueue 1 1 4')
    okay(await entries[1][1].shift(), {
        isGovernment: true,
        promise: '2/0',
        body: {
            promise: '2/0',
            majority: [ 1, 0 ],
            abdication: true
        }
    }, 'enqueue 1 1 4')
    routers[1].arrive('2/0', [ 0, 1 ], [ 1, 1, 1, 1, 0, 0, 0, 0 ])
    okay(await entries[0][1].shift(), {
        isGovernment: true,
        promise: '2/0',
        body: {
            promise: '2/0',
            majority: [ 1, 0 ],
            abdication: true
        }
    }, 'enqueue 0 1 4')
    for (let i = 0; i < 8; i++) {
        if (i != 1) {
            const snapshot = await snapshots[0][i].shift()
            await routers[0].snapshotted(i, snapshot.promise)
        }
    }
    for (let i = 0; i < 8; i++) {
        if (i != 1) {
            await entries[0][i].join(entry => entry.promise == '2/0')
            await entries[1][i].join(entry => entry.promise == '2/0')
        }
    }
    okay([
        await transitions[0].shift(), await transitions[1].shift()
    ], [{
        stage: 'transfer', identifier: '2/0'
    }, {
        stage: 'transfer', identifier: '2/0'
    }], 'transitions')
    routers[0].transition()
    const promises = []
    for (let i = 4; i < 8; i++) {
        promises.push((await entries[0][i].shift()).promise)
    }
    okay(promises, [ '3/0', '3/0', '3/0', '3/0' ], 'transitioned')
    routers[1].transition()
    promises.length = 0
    for (let i = 0; i < 4; i++) {
        promises.push((await entries[0][i].shift()).promise)
    }
    okay(promises, [ '3/0', '3/0', '3/0', '3/0' ], 'transitioned')
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
            this._semaphores = {}
            this.pause()
            this.unpause()
        }

        async wait (address, bucket) {
            if (this._semaphores[address] == null) {
                this._semaphores[address] = {}
            }
            assert(this._semaphores[address][bucket] == null)
            return new Promise(resolve => this._semaphores[address][bucket] = resolve)
        }

        notify (address, bucket) {
            if (this._semaphores[address] != null && this._semaphores[address][bucket] != null) {
                const resolve = this._semaphores[address][bucket]
                delete this._semaphores[address][bucket]
                resolve()
            }
        }

        pause () {
            this._unpause = new Promise(resolve => this._pause = resolve)
        }

        unpause () {
            this._pause.call()
        }

        async enqueue (address, value) {
            await this._pause
            return routers[address].enqueue(value)
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
        routers.push(new Router(destructible.durable([ 'router', i ]), {
            extractor: extractor,
            transport: transport,
            hash: value => value,
            buckets: 8,
            address: i
        }))
    }
    destructible.durable('test', test(okay, routers))
    await destructible.destructed
}
