const assert = require('assert')

class Register {
    constructor (id, publisher, consumers) {
        this._id = id
        this._queue = []
        this._version = 0
        this._sending = false
        this._backlog = true
        this._leaders = []
        this._leaership = []
        this._received = new Map
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

    // TODO Anything administrative can be built atop our atomic log which will
    // allow us to keep the register simple. Thus, growing the leadership is a
    // matter of sending an embaraction message through the atomic log. Each
    // member will get the message but the atomic log will be processed probably
    // asynchronously, so that we need to have only one member suggest it, or
    // else filter out subsequent requests by the cookie.
    //
    // Everyone can suggest it and then they can do a reduce where they remove
    // it once they have joined.
    //
    // This would get a new member on boarded, which once reduced we'd have to
    // check again, or rather once acclimated, we check to see if the member can
    // be used to grow leadership should the leadership be below the maximum.
    //
    // Growth of consensus is a matter of passing the new leadership in a round,
    // knowing that when the round is over everyone has the same leadership. We
    // use the atomic log to wait for the leadership change and it has to be
    // submitted by all members, then we can change leadership further.
    //
    // Somehow shrinkage needs to veto this.
    embark (cookie) {
        this._queue.push({ method: 'embark', message: cookie })
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
    // If our leadership is our majority, we can wait a round. A frame is either
    // learned when we get it or learned in the next frame. If a peer has not
    // received a message from a dead peer then their received version for that
    // peer will not advance. The message for that peer will not have been
    // learned so we can delete those messages from the frame and learn the
    // frame.
    //
    // If our leadership is a quorum and we're going by a majority of the quorum
    // then we have more work to do. The advantage of the quorum would be more
    // writers and a faster response to writes. If our application is across
    // data centers then each data center having a writer is a benefit, but we
    // still have to get through one frame to get to the next one, so maybe
    // three data centers is enough to make a difference. Perhaps it is a
    // question of topography where you shard two instances of sympatico such
    // that there is a read center for reporting or monitoring that has a node
    // from both instances.
    //
    // The follower can announce its candidacy itself.
    //
    shrink (leaders) {
        const losers = this._leaders.map(node => !~leaders.indexOf(node))
        this._leaders = leaders
        if (this._sending) {
            for (const node in losers) {
                for (const [ version, frame ] of frames) {
                    // Not sure if we're going to get a message from someone else
                    // who is aware of the new leadership before we are.
                    const leaders = new Set(frame.leaders)
                    if (! leaders.has(loser)) {
                        break
                    }
                    // If we haven't received a message from a loser, mark that
                    // message as `null`.
                    if (! frame.messages.has(node)) {
                        frame.messages.set(node, null)
                    }
                    // Lie about the losers. Pretend they got all all the messages we
                    // all sent because we don't care about their opinion anyway.
                    const receipts = frame.receipts.get(node)
                    for (const node of receipts.keys()) {
                        receipts.set(node, version)
                    }
                }
            }
            this._check()
        }
    }

    // Simply set the leaders to the new leaders. Everyone recieves the new
    // leaders. The new peer will not end up with a broken frame at all. They
    // will receive all the values for the current frame, possibly with some
    // approvals that are non-applicable.
    //
    // We add a message that states that we've submitted the entry for this
    // instance, and the atomic log counts down all the entries before
    // considering submitting another one since everyone will be submitting
    // this. Speaking in circles.
    //
    // Failure while growing is tricky. The frames will stop. There will have to
    // be a failure frame and that will have to cause our atomic log to stop its
    // countdown. Countdown becomes complete. We probably have new leadership
    // queued here so the queue is wiped. The leadership is what it is, so the
    // atomic log should work from that.
    grow (leaders) {
        if (leaders.length == 1) {
            this._leaders = leaders
        } else {
            this._leadership.push(leaders)
        }
        // TODO Assert that you are not shrinking.
    }

    // We send a message. If this is a response to a message from another node,
    // `node` is the id of the node initiated this frame. We will record its
    // receipt for the current version.
    _send (node = null) {
        // We are now sending.
        this._sending = true

        // Get the current version.
        const version = this._version

        // Splice some messages off our queue if any.
        const messages = this._queue.splice(0, this._maximumMessages)

        // We will immediately receive the packet we're about to send before we
        // process any other responses, so let's mark our receipt of that
        // message now.
        this._received.set(this._id, version)

        // If this is a response to a message from another node, acknowledge the
        // receipt of that message.
        if (node != null) {
            this._received.set(node, version)
        }

        // Create a packet to send to all of our peers, but not ourselves.
        const envelope = {
            to: this._leaders.filter(node => node != this._id),
            leaders: this._leaders.slice(),
            version: version,
            node: this._id,
            messages: messages,
            receipts: [ ...this._received ]
        }

        this._publisher.push(envelope)
        this._frames.set(version, {
            version: version,
            leaders: this._leaders,
            messages: new Map,
            receipts: new Map
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
        // Get the frame for the current version.
        const frame = this._frames.get(this._version)

        // If our leadership shrank, we may have extra messages. If all of the
        // current leaders have responded, then we have a frame to dispatch to
        // our consumers.
        const completed = [ ...frame.messages.keys() ].map(node => {
            return ~this._leaders.indexOf(node)
        }).length == this._leaders.length

        // If we have messages from all the leaders.
        if (completed) {
            // Capture the current version and increment to the next.
            const version = this._version++

            // Delete the current frame from the frame map.
            this._frames.delete(version)

            // Update our own set of receipts to reflect messages we received
            // since we sent our own packet.
            frame.receipts.set(this._id, new Map(this._received))

            // We can make this take ourselves and have a send regarless
            // function.
            for (const consumer of this._consumers) {
                consumer.consume(this, frame)
            }

            // We are no longer sending at this point.
            this._sending = false

            // Run our backlog through `receive`.
            this._backlog.splice(0).map(packet => this.receive(packet))

            // If we have not send because of a backlog, but one of our
            // consumers wants to send of the sake of receipts, then send.
            if (! this._sending && this.send) {
                this.send = false
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

    // We may use this to bring a follower on board where it is its own leader
    // or perhaps the determination is not based on the leader in the object,
    // but the leaders in the message so that followers are working through the
    // same logic.
    receive ({ version, node, messages, receipts, leaders }) {
        // If the version is the current version we process it.
        if (version == this._version) {
            // Here we assume that we will only ever grow.
            if (leaders.length > this._leaders.length) {
                if (this._sending) {
                    this._outbox.push({
                        to: leaders.filter(id => !~this._leaders.indexOf(id)),
                        version: version,
                        node: this._id,
                        messages: frame.messages.get(this.id),
                        receipts: [ ...this._received ]
                    })
                }
                this._leaders = leaders
            }
            // We may be receiving an incoming message, so we send a message and
            // prime it with a receipt for the node that called us.
            if (! this._frames.get(version)) {
                this._send(node)
            }

            // Record the receipts and messages for the node in the frame.
            const frame = this._frames.get(version)
            frame.receipts.set(node, receipts)
            frame.messages.set(node, messages)

            // Check to see if we are done with the frame.
            this._check()
        // If the version is greater than the current version we backlog,
        // otherwise we drop it.
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
