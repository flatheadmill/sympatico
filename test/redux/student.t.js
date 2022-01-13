require('proof')(1, okay => {
    const student = require('../../redux/student')
    okay(student, 'require')
})
