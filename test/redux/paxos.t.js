require('proof')(2, okay => {
    const Promise = require('../../redux/promise')
    const Paxos = require('../../redux/paxos')
    {
        let now = 1
        const owners = [ 0, 1 ].map(id => {
            const outbox = []
            return {
                outbox: outbox,
                paxos: new Paxos({
                    outbox: outbox,
                    leaders: [ 0, 1, 2 ],
                    startTime: 0,
                    assembly: 0,
                    promise: new Promise(id, { now: () => now })
                })
            }
        })
        owners[0].paxos.propose([ 0, 1 ])
        okay(owners[0].outbox, [{
            method: 'prepare',
            startTime: 0,
            assembly: 0,
            members: [ 0, 1 ],
            promise: [ 1, 0 ]
        }], 'prepare')
        function dispatch () {
            for (const owner of owners) {
                if (owner.outbox.length != 0) {
                    const message = owner.outbox.shift()
                    for (const receiver of owners) {
                        receiver.paxos.dispatch(message)
                    }
                }
            }
        }
        dispatch()
        dispatch()
        dispatch()
        dispatch()
        okay(owners[0].paxos.members, [ 0, 1 ], 'learned')
    }
})
