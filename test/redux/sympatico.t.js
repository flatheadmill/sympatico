require('proof')(1, okay => {
    const Sympatico = require('../../redux/sympatico')
    const sympatico = new Sympatico('alpha', {
        entry (entry) {
        }
    })
    const shifter = sympatico.outbox.shifter().sync
    sympatico.appoint({
        version: 0n,
        leaders: [ 'alpha' ],
        followers: [],
        properties: { 'alpha': { id: 0, properties: {} } }
    })
    const message = shifter.shift()
    okay(true)
})
