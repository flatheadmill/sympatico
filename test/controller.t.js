require('proof')(2, async okay => {
    const { Future } = require('perhaps')
    const Destructible = require('destructible')
    const { Queue } = require('avenue')

    const destructible = new Destructible('test/integration.t.js')
    const Compassion = require('compassion')

    const Controller = require('../controller')

    // TODO What happens to a joining participant if the participant that has
    // the snapshot it is reading crashes? Seems like we need to crash the
    // joining participant and have it restart.

    // Example of a Key/Value store application. The controller takes an
    // instance of an object that implements this interface in its entirety.

    //
    class KeyValue {
        // Out key/value application has an object that stores the key/value
        // pairs.

        //
        constructor () {
            this.kv = {}
        }

        // Take a snapshot of the current state of the application. The snapshot
        // must represent the current state of the application frozen at the
        // point at which this method is called. It returns a function that will
        // push the state onto a message queue. The messages in the queue are
        // streamed to a new instance of the application. Every participant will
        // create a snapshot, but only one will be used. The function will be
        // called with a canceled flag so that if the snapshot streaming is
        // expensive it can be skipped for unused snapshots.

        //
        async snapshot () {
            const snapshot = JSON.parse(JSON.stringify(this.kv))
            return async (queue, canceled) => queue.push(snapshot)
        }

        // Apply a snapshot when an instance joins an existing collaboration.

        //
        async join (shifter) {
            this.kv = shifter.shift()
        }

        // When we join we duplicate the entire application state, but once we
        // are replicated the new participant only needs the half of the state
        // that applies to the specific bucket. Similarly the split participant
        // only needs the half of the state that is remaining. We purge any
        // entry that is not included according to a hash of the key. This can
        // be performed either during the call to `purge` blocking any further
        // processing of the log or a function can be returned so that it can be
        // performed asynchronously.

        //
        async purge (includes) {
            return async () => {
                for (const key in this.kv) {
                    if (! includes(key)) {
                        delete this.kv[key]
                    }
                }
            }
        }

        // Entires are user application messages. The return value is returned
        // to the participant from which the request originated as a return
        // value. This method is invoked in the order of the underlying atomic
        // log. Processing of application state should complete within this
        // function, however if there is additional work that needs to be done
        // outside of this critical section you can return a function to perform
        // that work and the function will be called asynchronously.

        //
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
