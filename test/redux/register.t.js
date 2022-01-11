require('proof')(2, okay => {
    const Register = require('../../redux/register')
    const registers = []
    function createRegister () {
        const publisher = [], log = []
        const register = new Register(registers.length, publisher, [{
            consume (register, frame) {
                log.push(frame)
            }
        }])
        registers.push({ register, publisher, log: log })
    }
    createRegister()
    function dump (value) {
        switch (typeof value) {
        case 'object': {
                if (Array.isArray(value)) {
                    return value.map(value => dump(value))
                }
                if (Buffer.isBuffer(value)) {
                    return JSON.parse(value)
                }
                if (value instanceof Set) {
                    return dump([ ...value ].sort((left, right) => left - right))
                }
                if (value instanceof Map) {
                    const object = {}
                    for (const [ k, v ] of value) {
                        object[k] = dump(v)
                    }
                    return object
                }
                const object = {}
                for (const key in value) {
                    object[key] = dump(value[key])
                }
                return object
            }
        default: {
                return value
            }
        }
    }
    registers[0].register.appoint([ 0 ])
    registers[0].register.enqueue(Buffer.from(JSON.stringify({ a: 1 })))
    console.log(registers[0].publisher)
    okay(dump(registers[0].publisher.splice(0)), [{
        to: [],
        version: 0,
        node: 0,
        messages: [{ a: 1 }],
        receipts: [ [ 0, 0 ] ]
    }], 'packets')
    okay(dump(registers[0].log.splice(0)), [{
        version: 0,
        leaders: [ 0 ],
        messages: { 0: [{ a: 1 }] },
        receipts: { 0: { '0': 0 } }
    }], 'frame')
})
