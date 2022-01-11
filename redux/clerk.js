// A too cute name. I don't want anyone to be put off by Student and Clerk and
// think that I'm channeling Paxos, but I probably am channeling Paxos.
class Clerk {
    constructor () {
    }

    consume (register, frame) {
        MESSAGES: for (const [ node, message ] of frame.messages) {
            if (message == null || message.length != 0) {
                for (const receipts of frame.receipts.values()) {
                    if (receipts.get(node) != version) {
                        register.send = true
                        break MESSAGES
                    }
                }
            }
        }
    }
}

module.exports = Clerk
