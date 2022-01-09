class Register {
    constructor (id, publisher, consumers) {
        this._id = id
        this._queue = []
        this._version = 0
        this._sending = false
        this._backlog = true
        this._leaders = new Set
        this._received = new Map
        this._leaders = new Set
        this._frames = new Map
        this._maximumMessages = 256
        this._publisher = publisher
        this._consumers = consumers
        this._backlog = []
    }

    enqueue (message) {
        this._queue.push(message)
        if (! this._sending) {
            this._send()
        }
    }

    // On boarding is probably going to be handled between the network and the
    // register. A follower will begin to receive promoted messages. Offhand,
    // perhaps we want to ensure we are in stalled state so that no progress is
    // made after a stall, that the algorithm does not resume since we are going
    // to receive new leadership, we asked for it, we're going to get it, let's
    // not complicate matters by getting ahead and having the leadership message
    // possibly arrive at some unimagined liminal state of the register.
    //
    // TODO Paxos may decide we're ready to onboard a follower before it is
    // really ready. We need to have a way of expressing acclimation here and
    // communicating it to Paxos. That acclimation could be expressed as either
    // a distance behind the leader, or no, that's exactly what it should be. If
    // the follower can't catch up to within 256 messages than it is not
    // leadership material.
    //
    // The follower can announce its candidacy itself.
    //
    appoint (leaders) {
        this._leaders = new Set(leaders)
        for (const node of this._received.keys()) {
            if (! this._leaders.has(node)) {
                this._received.delete(node)
            }
        }
        // TODO Instead of deleting, you need to learn.
        // TODO Just remember to shrink before we expand.
        for (const [ version, frame ] of this._frames) {
            for (const node of frame.keys()) {
                if (! this._leaders.has(node)) {
                    frame.messages.delete(node)
                    frame.receipts.delete(node)
                }
            }
        }
        if (this._sending) {
            this._check()
        }
    }

    _send () {
        this._sending = true
        const version = this._version
        const messages = this._queue.splice(0, this._maximumMessages)
        let index = 0
        this._received.set(this._id, version)
        const envelope = {
            to: [ ...this._leaders ].filter(node => node != this._id),
            version: version,
            node: this._id,
            messages: messages,
            receipts: [ ...this._received ]
        }
        this._publisher.push(envelope)
        this._frames.set(version, {
            version: version,
            leaders: new Set(this._leaders),
            messages: new Map,
            receipts: new Map([ ...this._leaders ].map(leader => [ leader, null ]))
        })
        this.receive(envelope)
    }

    // Assuming a traditional paxos on a low volume network. If a leader sends a
    // message to a three leader group and receives same version receipts it
    // knows that it can learn. The other two members can learn immediately as
    // well. One plus one means we will will not split brain. If it is a five
    // leader group then the same applies, for the sender, but the others can
    // only learn when they receive a majority of messages from other leaders.
    // Ideally they receive the response at roughtly the same time as the leader
    // since the message to the leader is a broadcast. No subsequent message is
    // necessary.

    // If two leaders in a two leader both send messages, they cannot learn.
    // Three leader group the same. Five leader group they can learn.

    // But, if all we are sending is the maxium frame, then how can tell our
    // peer in the traditional paxos that, yes, we know about the message we
    // just sent you? This one particular message is known to me, now it is
    // known to you. You inform me as such and when I recieve my acknowledgement
    // from the other leader I can learn this frame. You have to wait for the
    // acknowledgement from the other leader.

    // This it is the case that we must include in our receipts a map of
    // versions to a map of nodes to a set of responses we've received, but only
    // if those responses are to envelopes that contain messages.

    //
    _check () {
        const frame = this._frames.get(this._version)
        if (frame.receipts.size == this._leaders.size) {
            const version = this._version++
            this._frames.delete(version)
            // We can't do anything until we get the frame in any case. So let's
            // open our frame here. A log entry includes all the messages sent
            // by all leaders. We can learn the entry if a majority of leaders
            // have acknowledge receipt of the version.
            // TODO Left off here. Create a map of nodes...
            frame.receipts.set(this._id, new Map(this._received))
            let send = false
            for (const consumer of this._consumers) {
                if (!! consumer.push(frame)) {
                    send = true
                }
            }
            this._sending = false
            // Run our backlog through `receive`.
            this._backlog.splice(0).map(packet => this.receive(packet))
            // If we have not sent because of a backlog, but our last receipt
            // does not match the current state of received messages, send for
            // the sake of sending receipts. This will always correctly advance
            // the frame. If we have a single leader send a message in a frame
            // the frame will complete when the other leaders ...
            if (! this._sending && send) {
                this._send()
            }
        }
    }

    receipts = {
        4: {
            0: { 0: 4, 1: 3, 2: 3 },
            1: { 0: 4, 1: 4, 2: 3 },
            2: { 0: 4, 1: 3, 2: 4 }
        }
    }

    receipts = {
        9: {
            0: { 0: 9, 1: 8, 2: 8, 3: 8, 4: 8 },
            1: { 0: 9, 1: 9, 2: 8, 3: 8, 4: 8 },
            2: { 0: 9, 1: 8, 2: 9, 3: 8, 4: 8 },
            3: { 0: 9, 1: 8, 2: 8, 3: 9, 4: 8 },
            4: { 0: 9, 1: 8, 2: 8, 3: 8, 4: 9 }
        }
    }

    // Here we have a case where both 0 and 2 have sent a message. It's a race
    // to see who gets the acknowledgements first. They will not receive each
    // other's acknowledgements so there are three left. This means they must
    // wait for the next frame to learn the messages in the previous frame.

    // Now we appear to be dragging on frame completion.
    receipts = {
        9: {
            0: { 0: 9, 1: 8, 2: 9, 3: 8, 4: 8 },
            1: { 0: 9, 1: 9, 2: 8, 3: 8, 4: 8 },
            2: { 0: 8, 1: 8, 2: 9, 3: 8, 4: 8 },
            3: { 0: 9, 1: 8, 2: 9, 3: 9, 4: 8 },
            4: { 0: 9, 1: 8, 2: 9, 3: 8, 4: 9 }
        }
    }

    receive ({ version, node, messages, receipts }) {
        if (version == this._version) {
            if (! this._frames.get(version)) {
                this._send()
            }
            const frame = this._frames.get(version)
            frame.receipts.set(node, receipts)
            frame.messages.set(node, messages)
            this._check()
        } else if (version > this._version) {
            // This backlog is all you need to deal with onboarding message
            // overlap. We do not need to handle this between the register and
            // the network. We can replace it with a sorted structure and if
            // there is a large backlog we'll only go through it once instead of
            // repeatedly creating a backlog, however message should be arriving
            // in order to fill the backlog in any case.
            this._backlog.push({ version, node, messages, receipts })
        }
    }
}

module.exports = Register
