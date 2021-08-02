async function main () {
    class Application {
        constructor () {
        }

        async bootstrap () {
        }

        async join ({ promise, index, shifter }) {
            this._map.clear()
            for await (const entry of shifter) {
                if (entry.index != null && entry.index != index) {
                    continue
                }
                switch (entry.method) {
                case 'series': {
                        this._series = entry.value
                    }
                    break
                case 'entry': {
                        this._map.set(entry.key, entry.value.value)
                    }
                    break
                }
            }
        }

        async snapshot ({ promise, queue }) {
            await queue.push({ key: null, value: { method: 'series', value: this._series } })
            for (const [ key, value ] of this._map) {
                await queue.push({ key, value: { method: 'entry', value } })
            }
        }

        async arrive ({ promise }) {
        }

        async write ({ hashed, index, key, request }) {
            switch (request.method) {
            case 'set': {
                }
                break
            }
        }

        async read () {
        }

        async depart () {
        }
    }

    const application = new Application

    const sympatico = new Sympatico(application)

    await sympatico.write('x', { method: 'set', value: 1 })

    const got = await sympatico.read('x', { method: 'get' })
})
