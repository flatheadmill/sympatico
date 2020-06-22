require('proof')(5, prove)

function prove (okay) {
    const Table = require('../table')
    const tables = [], shifters = []
    tables.push(new Table(16))
    shifters[0] = tables[0].queue.shifter().sync
    tables[0].arrive('1/0')
    // Structure of table. Table is the length of buckets, so we hash out the id
    // to find the bucket. The element is the consesus for the bucket with the
    // leader as the first element in the bucket.
    okay(shifters[0].shift(), [
        [ '1/0' ], [ '1/0' ], [ '1/0' ], [ '1/0' ], [ '1/0' ], [ '1/0' ], [ '1/0' ], [ '1/0' ],
        [ '1/0' ], [ '1/0' ], [ '1/0' ], [ '1/0' ], [ '1/0' ], [ '1/0' ], [ '1/0' ], [ '1/0' ]
    ], 'bootstrap')
    tables[0].transition()
    tables[0].complete()
    tables.push(new Table(16))
    shifters[1] = tables[1].queue.shifter().sync
    tables[0].arrive('2/0')
    okay(shifters[0].shift(), [
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ]
    ], 'arrive')
    tables[1].join(JSON.parse(JSON.stringify(tables[0].snapshot('2/0'))))
    tables[1].arrive('2/0')
    okay(shifters[1].shift(), [
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ]
    ], 'join')
    for (const table of tables) {
        table.acclimate('2/0')
        table.transition()
        table.complete()
    }
    tables.push(new Table(16))
    shifters[2] = tables[2].queue.shifter().sync
    tables[0].arrive('3/0')
    tables[2].join(JSON.parse(JSON.stringify(tables[0].snapshot('3/0'))))
    for (const table of tables.slice(1)) {
        table.arrive('3/0')
    }
    okay(shifters[0].shift(), [
        [ '3/0', '2/0', '1/0' ],
        [ '3/0', '2/0', '1/0' ],
        [ '3/0', '2/0', '1/0' ],
        [ '2/0', '1/0', '3/0' ],
        [ '2/0', '1/0', '3/0' ],
        [ '2/0', '1/0', '3/0' ],
        [ '2/0', '1/0', '3/0' ],
        [ '2/0', '1/0', '3/0' ],
        [ '3/0', '2/0', '1/0' ],
        [ '3/0', '2/0', '1/0' ],
        [ '1/0', '3/0', '2/0' ],
        [ '1/0', '3/0', '2/0' ],
        [ '1/0', '3/0', '2/0' ],
        [ '1/0', '3/0', '2/0' ],
        [ '1/0', '3/0', '2/0' ],
        [ '1/0', '3/0', '2/0' ]
    ], 'three')
    for (const table of tables) {
        table.acclimate('3/0')
        table.transition()
        table.complete()
    }
    tables[0].depart('3/0')
    okay(shifters[0].shift(), [
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '2/0', '1/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ],
        [ '1/0', '2/0' ]
    ], 'depart')
}
