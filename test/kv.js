class KeyValue {
    async messages (shifter, queue) {
        for await (const message of shifter) {
            switch (message.method) {
            case 'bootstrap': {
                }
                break
            case 'snapshot': {
                }
                break
            case 'join': {
                }
                break
            case 'purge': {
                }
                break
            case 'entry': {
                }
                break
            }
            queue.push(message)
        }
    }

    async set (key, value) {
        await this.sympatico.enqueue({ method: 'set', key, value })
    }

    async get (key) {
        const got = await this.sympatico.enqueue({ method: 'get', key, value })
        return got.value
    }
}

module.exports = KeyValue
