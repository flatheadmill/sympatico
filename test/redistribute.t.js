require('proof')(2, okay => {
    const redistribute = require('../redistribute')

    const odd = redistribute(3, [ 0, 0, 0, 0, 0, 0, 0, 0 ])
    okay(odd, [ 1, 2, 1, 2, 1, 0, 0, 0 ], 'odd')
    const even = redistribute(4, [ 0, 0, 0, 0, 0, 0, 0, 0 ])
    okay(even, [ 1, 2, 3, 1, 2, 3, 0, 0 ], 'even')
})
