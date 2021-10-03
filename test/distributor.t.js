require('proof')(6, okay => {
    const Monotonic = require('paxos/monotonic')
    const Distributor = require('../distributor')

    class Machine {
        constructor (network, address) {
            this.network = network
            this.address = address
            this.distributor = new Distributor({ active: 3, ratio: 4 })
            this.shifter = this.distributor.events.shifter().sync
            this.majorities = []
        }

        get status () {
            return {
                distributor: this.distributor.status
            }
        }

        request (message) {
            if (message.method == 'paxos') {
                for (const request of message.request) {
                    for (const to of request.to) {
                        if (to.promise == this.distributor.promise) {
                            this.majorities[to.index] = request.majority.slice()
                        }
                    }
                }
            }
            this.distributor.request(message)
        }

        response (message) {
            this.distributor.response(message)
        }
    }

    class Network {
        constructor () {
            this.machines = {}
            this.address = 0
            this.promise = '0/0'
            this.leader = null
            this.log = []
        }

        get status () {
            const status = []
            for (const machine in this.machines) {
                status.push(this.machines[machine].status)
            }
            return status
        }

        arrive () {
            this.machines[this.address] = new Machine(this, String(this.address))
            this.address++
            this.promise = Monotonic.increment(this.promise, 0)
            if (this.promise == '1/0') {
                this.leader = this.promise
            }
            this.log.push({ promise: this.promise, method: 'arrive', leader: this.leader })
            this.submission = []
        }

        submit () {
            if (this.submission.length == 0) {
                this.submission = Object.keys(this.machines)
            }
            while (this.submission.length != 0) {
                const address = this.submission.shift()
                const machine = this.machines[address]
                const message = machine.shifter.shift()
                if (message != null && machine.distributor.leader) {
                    this.log.push(message)
                    return true
                }
            }
            return false
        }

        advance () {
            if (this.next == null) {
                if (this.log.length == 0) {
                    return false
                }
                const to = Object.keys(this.machines)
                this.next = { to: to, message: this.log.shift(), count: to.length }
            }
            const to = this.next.to.shift()
            this.machines[to].request(this.next.message)
            if (--this.next.count == 0) {
                for (const address in this.machines) {
                    this.machines[address].response(this.next.message)
                }
            }
            if (this.next.to.length == 0) {
                if (this.next.message.next != null) {
                    this.events.push(this.next.message.next)
                }
                this.next = null
            }
            return true
        }

        drain() {
            let advanced = true
            while (advanced) {
                advanced = false
                while (this.submit()) {
                    advanced = true
                }
                while (this.advance()) {
                    advanced = true
                }
            }
        }
    }

    // Default construtor, won't be used though.
    {
        const distributor = new Distributor
        okay(distributor.ratio, 1, 'default ratio')
        okay(distributor.active, Number.MAX_SAFE_INTEGER, 'default active')
    }

    {
        const distributor = new Distributor({ active: 3, ratio: 4 })

        const shifter = distributor.events.shifter().sync

        okay(distributor.ratio, 4, 'constructor ratio')
        okay(distributor.active, 3, 'constructor maximum')

        distributor.arrive('1/0', '1/0')

        const dispatch = shifter.shift()
        okay(dispatch, {
            method: 'paxos',
            series: 0,
            index: 0,
            cookie: '1',
            request: [{
                method: 'appoint',
                to: [{ promise: '1/0', index: 0 }],
                majority: [{ promise: '1/0', index: 0 }],
            }],
            response: [{
                method: 'majority',
                to: [{ promise: '1/0', index: 0 }],
                majority: [ '1/0' ]
            }]
        }, 'arrive')

        distributor.complete(dispatch)
    }

    const network = new Network

    network.arrive()

    network.drain()

    okay(network.status, [{
        distributor: {
            arrivals: [],
            instances: [[ '1/0' ]],
            departed: [],
            buckets: [{ majority: [ '1/0' ] }]
        }
    }], 'bootstrapped')
})
