require('proof')(2, async okay => {
    const { Future } = require('perhaps')
    const Destructible = require('destructible')
    const { Queue } = require('avenue')

    const destructible = new Destructible('test/integration.t.js')
    const Compassion = require('compassion')

    const Controller = require('../controller')

    class KeyValue {
        constructor () {
            this.kv = {}
            this._snapshots = {}
        }

        async join (shifter) {
            this.kv = shifter.shift()
        }

        async snapshot () {
            const snapshot = JSON.parse(JSON.stringify(this.kv))
            return async (queue, canceled) => queue.push(snapshot)
        }

        async purge (includes) {
            return async () => {
                for (const key in this.kv) {
                    if (! includes(key)) {
                        delete this.kv[key]
                    }
                }
            }
        }

        async entry (entry) {
            switch (entry.method) {
            case 'put': {
                    const { key, value } = entry
                    this.kv[key] = value
                    return { key, value }
                }
                break
            case 'get': {
                    return async () => {
                        return this.kv[entry.key]
                    }
                }
            }
        }
    }

    class Participant {
        static count = 0

        constructor (destructible, sympatico, { address, port }) {
            this.sympatico = sympatico
            this.url = `http://127.0.0.1:${port}`
            this.shifter = sympatico.events.shifter()
            this.destructible = destructible
        }

        static async create (census) {
            const subDestructible = destructible.ephemeral(`compassion.${Participant.count++}`)
            const sympatico = new Controller(subDestructible.durable('controller'))
            subDestructible.destruct(() => census.destroy())
            const address = await Compassion.listen(subDestructible, {
                census: census,
                applications: { sympatico },
                bind: { host: '127.0.0.1', port: 0 }
            })
            return new Participant(subDestructible, sympatico, address)
        }
    }

    destructible.ephemeral('test', async () => {
        const census = new Queue()
        const participants = []
        participants.push(await Participant.create(census.shifter()))

        census.push([ participants[0].url ])
        okay(await participants[0].shifter.join(entry => entry.method == 'acclimated'), { method: 'acclimated' }, 'acclimated')
        okay(await participants[0].shifter.join(entry => entry.method == 'entry' && entry.entry.direction == 'reduce'), {
            method: 'entry', entry: { cookie: '1', direction: 'reduce' }
        }, 'bootstrapped')

        // participants[0].sympatico.enqueue('x', { value: 'x' })

        destructible.destroy()
    })

    await destructible.promise
})
