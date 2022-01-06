require('proof')(5, okay => {
    const Log = require('../../redux/log')
    const entries = []
    const log = new Log(entries)
    log.arrive(0)
    log.push({ version: 0n, node: 0, index: 0, value: 1 })
    log.arrive(1)
    log.push({ version: 1n, node: 0, index: 0, value: 1 })
    log.push({ version: 1n, node: 0, index: 1, value: 1 })
    log.arrive(2)
    log.push({ version: 2n, node: 0, index: 0, value: 1 })
    log.advance(2, 1n)
    log.advance(0, 0n)
    log.advance(1, 0n)
    const replay = []
    log.replay(1n, 0, 0, replay)
    okay(replay, [{
        version: 1n, node: 0, index: 1, value: 1
    }, {
        version: 2n, node: 0, index: 0, value: 1
    }], 'replay')
    okay(log.minimum(), 0n, 'minimum')
    okay(entries.splice(0), [{
        version: 0n, node: 0, index: 0, value: 1
    }, {
        version: 1n, node: 0, index: 0, value: 1
    }, {
        version: 1n, node: 0, index: 1, value: 1
    }, {
        version: 2n, node: 0, index: 0, value: 1
    }], 'push')
    log.advance(0, 1n)
    log.advance(1, 1n)
    okay(log.minimum(), 1n, 'advanced')
    log.advance(0, 1n)
    log.advance(1, 1n)
    log.depart(2)
    okay(log.minimum(), 1n, 'departed')
})
