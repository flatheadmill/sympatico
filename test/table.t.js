require('proof')(5, prove)

function prove (okay) {
    const Table = require('../table')
    const tables = [], shifters = []
    tables.push(new Table(16))
    shifters[0] = tables[0].queue.shifter().sync
    tables[0].arrive('1/0', { location: 0 })
    okay(shifters[0].shift(), [
        '1/0', '1/0', '1/0', '1/0', '1/0', '1/0', '1/0', '1/0',
        '1/0', '1/0', '1/0', '1/0', '1/0', '1/0', '1/0', '1/0'
    ], 'bootstrap')
    tables.push(new Table(16))
    shifters[1] = tables[1].queue.shifter().sync
    tables[0].arrive('2/0', { location: 1 })
    okay(shifters[0].shift(), [
        '2/0', '2/0', '2/0', '2/0', '2/0', '2/0', '2/0', '2/0',
        '1/0', '1/0', '1/0', '1/0', '1/0', '1/0', '1/0', '1/0'
    ], 'arrive')
    tables[1].join(JSON.parse(JSON.stringify(tables[0].snapshot('2/0'))))
    tables[1].arrive('2/0', { location: 1 })
    okay(shifters[1].shift(), [
        '2/0', '2/0', '2/0', '2/0', '2/0', '2/0', '2/0', '2/0',
        '1/0', '1/0', '1/0', '1/0', '1/0', '1/0', '1/0', '1/0'
    ], 'join')
    tables[0].acclimate('2/0')
    tables.push(new Table(16))
    shifters[2] = tables[2].queue.shifter().sync
    tables[0].arrive('3/0', { location: 2 })
    okay(shifters[0].shift(), [
        '3/0', '3/0', '3/0', '2/0', '2/0', '2/0', '2/0', '2/0',
        '3/0', '3/0', '1/0', '1/0', '1/0', '1/0', '1/0', '1/0'
    ], 'three')
    tables[0].depart('3/0')
    okay(shifters[0].shift(), [
        '2/0', '1/0', '1/0', '2/0', '2/0', '2/0', '2/0', '2/0',
        '2/0', '1/0', '2/0', '1/0', '1/0', '1/0', '1/0', '1/0'
    ], 'depart')
}
