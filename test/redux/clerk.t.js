require('proof')(1, okay => {
    const Clerk = require('../../redux/clerk')
    const clerk = new Clerk
    okay(clerk, 'require')
})
