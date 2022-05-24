require('proof')(1, okay => {
    const Sympatico = require('../../redux/sympatico')
    const sympatico = new Sympatico({ id: 'alpha', when: 0 })
    okay(sympatico, 'require')
    okay(sympatico.get(), { id: 'alpha', when: 0 }, 'get')
    sympatico.candidates([
        [{ id: 'alpha', when: 0 }],
        [{ id: 'bravo', when: 1 }],
        [{ id: 'charlie', when: 3 }]
    ])
})
