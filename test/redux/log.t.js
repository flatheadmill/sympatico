require('proof')(1, okay => {
    const Log = require('../../redux/log')
    const entries = []
    const log = new Log(entries)
    log.push({ version: 0n, node: 0, index: 0, value: 1 })
    okay(entries, [{
        version: 0n, node: 0, index: 0, value: 1
    }], 'push')
})
