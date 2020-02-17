require('proof')(1, prove)

async function prove (okay) {
    const Pause = require('../pause')
    const pauses = { first: new Pause, second: new Pause }
    const Destructible = require('destructible')
    const destructible = new Destructible('test/pause.t')

    async function first () {
        pauses.first.allow('1/0')
        pauses.first.allow('2/0')
    }
    async function second () {
        await pauses.first.allowed('2/0')
        okay(true)
    }

    destructible.durable('first', first())
    destructible.durable('second', second())
    await destructible.destructed
}
