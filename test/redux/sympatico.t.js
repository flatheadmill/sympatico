require('proof')(1, okay => {
    const Sympatico = require('../../redux/sympatico')
    const sympatico = new Sympatico(0)
    okay(sympatico, 'require')
})
