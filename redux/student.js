class Student {
    constructor () {
        this._frames = frame
    }

    _sendable (version) {
        if (this._frames.length == 2) {
        }
    }

    consume (register, frame) {
        for (const [ node, messages ] of frame.messages) {
            if (messages == null) {
                frame.set(node, [])
            }
        }
        this._frames.push(frame)
        if (this._frames.length == 2) {
            MESSAGES: for (const [ node, messages ] of this._frames[0].messages) {
                if (messages.length != 0) {
                    for (const frame of this._frames) {
                        let version = null
                        for (const receipts of frame.receipts.values()) {
                            const got = receipts.got(node)
                            if (got != null) {
                                version = got
                                break
                            }
                        }
                        if (version != this._frames[0].version) {
                            frame.messages.set(node, [])
                            continue MESSAGES
                        }
                    }
                }
            }
            this._consumer.consume(this._frame.shift())
        }
        CURRENT: do {
            for (const [ node, messages ] of this._frames[0].messages) {
                if (messages == null) {
                    frame.set(node, [])
                } else if (messages.length != 0) {
                    for (const receipts of this._frames[0].receipts.values()) {
                        if (receipts.get(node) != version) {
                            break CURRENT
                        }
                    }
                }
            }
            this._consumer.consume(this._frame.shift())
        } while (false)
    }
}

module.exports = Student
