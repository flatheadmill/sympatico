require('proof')(1, async okay => {
    const { Future } = require('perhaps')
    const Destructible = require('destructible')
    const { Queue } = require('avenue')

    const destructible = new Destructible('test/integration.t.js')
    const Compassion = require('compassion')

    const Controller = require('../controller')

    class Participant {
        static count = 0

        constructor (destructible, sympatico, { address, port }) {
            this.sympatico = sympatico
            this.url = `http://127.0.0.1:${port}`
           this.shifter = sympatico.events.shifter()
            this.destructible = destructible
        }

        static async create (census) {
            const sympatico = new Controller
            const subDestructible = destructible.ephemeral(`compassion.${Participant.count++}`)
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
        console.log('--- HERE ---')
        okay(await participants[0].shifter.join(entry => entry.method == 'acclimated'), { method: 'acclimated' }, 'acclimated')
        console.log('--- THERE ---')

        destructible.destroy()
    })

    await destructible.promise
})
