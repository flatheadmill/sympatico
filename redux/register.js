const assert = require('assert')

// Completely forgot how this thing works, so some bullet points until the
// algorithm loads into memory.

// * There was some aspect in student that was about voting someone off the
// island, but that was all about rejecting an submissions from that participant
// that were in a partial state.
// * Still can't remember how it is two-phase.
// * No idea what leadership means here. Vaguely remember realizing that what I
// really had was a "leadership" and tie-breakers. These days I'd want to
// describe participants as being synchronous or asynchronous replicas, so maybe
// rewrite the documentation in those terms.
// * For some reason I needed a Paxos, not a multi-Paxos, just a Paxos, and
// that's not done, so I can finish that while I remember the rest of it.

// Coming back to me.

// Start off with a glossary. If you really hate a term you can change it later,
// but you can't change it from sentance to sentance as you decide on the
// perfect term.

// * Sympatico &mdash; what we call our algorithm.
// * Paxos &mdash; Paxos used for elections.
// * node &mdash; deal with it.
// * quorum &mdash; collection of nodes participating in Sympatico.
// * sync node &mdash; node actively participating in symatico.
// * async node &mdash; node following the active participants, stand by or
// getting up to speed to participate.
// * peer &mdash; a sync node participating in Sympatico that is not the one
// we're talking about.
// * frame &mdash; a round of messages in the Sympatico algorithm.
// * frame element &mdash; an entry in the frame for a specific node.
// * version &mdash; a contiguous integer sequence to order frames.
// * ack array &mdash; an array of the greatest version received from each node
// by a node sent by a node in the frame.
// * envelope &mdash; our network message, which is frame and ack array.
// * message &mdash; a user or system message, the data we want to replicate.
// * log &mdash; the algorithm output, an atomic log of messages.
// * commit &mdash; the act of recording a message and writing it to the log.

// This is written to load this into my head when I revisit this code. It is not
// general documentation.
//
// The register manages frames. There is a series of frames. One frame follows
// another. They are given a version number. The number increases one step at a
// time, it is a series of contiguous integers. A register will not send a frame
// until it has received acknowledgments from all the other sync nodes for the
// last frame it send.
//
// An envelope includes a frame and an ack array.
//
// To send a user or system message a sync node waits until it is able to send
// the next frame version. It then sends an envelope with the message and the
// current ack array.
//
// If no other sync node has messages to send at this moment in time they will
// be idle. When they receive the message they will record the frame message
// update their internal ack array and send a frame with no messages and their
// updated ack array. The sender will receive the frames. It will see that all
// the other sync nodes have acknowledged the message and it will commit the
// message to the log.
//
// When the system is not under load, a write is as fast as the slowest
// connection between two nodes.
//
// If a node sends a message when a peer sync node also sends a message they
// will use the same version number for their frames. Thus, it will not be the
// case that the frame that the sender receives will have acknowledgements form
// all of the peers when that version completes. Therefore, it must immediately
// send a frame with an updated ack array whether or not there are messages to
// send so that the message can be committed.
//
// And that is that for the crux of symaptico. This appears to have been
// implemented.
//
// We have implemented two generic message consumers. One is a clerk that will
// check to see if we need to send the ack array regardless of pending messages,
// to flush the message. The other will check to see if we have all the
// acknowledgements for a frame and if so, it will commit all the messages from
// all the sync nodes for that frame.
//
// ### Objectives
//
// Objectives for the Node.js version of Sympatico is to create a go by for a
// Rust implementation of Sympatico so that your humble author is not attempting
// to tease out this implementation in a language he is not familiar with. The
// Node.js version is a throw away and not not suitable for production. Nothing
// written in Node.js is suitable for production.
//
// The objective of Sympatico is to reduce the latency of a consensus algorithm
// across data centers for administrative applications of the algorithm. The end
// product is an implementation of `etcd` in Rust that can be used by Kubernetes
// to implement a cluster across data centers.
//
// Sympatico itself, or at least the parts I am discussing today, is not focused
// on this `etcd` implementation. It is instead focused on implementing an
// atomic log. I'll discuss the objectives for the atomic log and will
// frequently be stating no goals for the atomic log. These non-goals for the
// atomic log may or may not be non-goals for the ultimate goal.
//
// For example, it is a non-goal of the atomic log to save state to persistent
// storage, but it is likely a goal of an application of the atomic log. This is
// the last time I'll make a disclaimer of this sort. Non-goal stated.
//
// We only want an atomic log to drive applications. When the log message has
// been consumed by an application it can be discarded. If the application is in
// a bad state where it manages to lose the atomic log messages through it's own
// incompetence it should crash restart and an rejoin.
//
// Thus, we are creating an in-memory data structure. Perhaps this is the only
// significant caveat and disclaimer.
//
// Another related non-goal is the preservation of identity. Every time a node
// joins it is given a new identifier. We are not trying to reconstruct a
// network topology. Sympatico has no knowledge that data center A went offline
// and that the node that just arrived is data center A and everything is
// hunky-dory. TODO Probably do need an awareness at the Paxos level.
//
// Okay, some hand waving now, because this is where I left off. The Sympatico
// algorithm can probably handle on boarding. It will bring a new node in as an
// async node and then when the async node. The atomic log generated by this
// node will not be a synchronous log, it will not be "real-time." This will
// give the application time to initialize and request any information in needs
// to get up to speed to participate in the synchronous processing of messages.
//
// Once the application is confident that it can process messages synchronously,
// it will mark it's Sympatico node as "acclimated." At that point the node will
// begin to receive messages synchronously.
//
// TODO Determine how to implement back-pressure because we cannot implement
// load shedding. Does the application allow messages to fill an in-memory queue
// sending acknowledgements immediately? Does it process each message one at a
// time. Probably a matter of having a receipt queue size, but some applications
// may want to ensure they've written each message to persistent storage before
// they allow Sympatico to continue. &mdash; Sounds like a decision, please
// revisit soon and mark as decided.
//
// When a node cannot receive frames from any one of its peers it freezes. It
// could be that the peer has crashed and if that is the case then their may be
// a way to add node removal to Sympatico, but it could also be the case that
// the network connection between two nodes is broken, but those two nodes can
// talk to all other nodes, so now we have a situation where one of them needs
// to get voted out of the quorum. For voting we need a consensus algorithm and
// we will use Paxos.
//
// When a sync node has stalled it will look at its acknowledgements and if
// there is a minority of missing acknowledgements it will attempt to vote them
// out of the quorum by initiating a round of Paxos. If there is a majority of
// missing acknowledgements then it will do nothing and wait, it is likely
// network isolated. (Okay, but Sympatico is not Paxos, it should try to run
// Paxos and see what Paxos has to say about it.)
//
// Thus, each node has Sympatico and Paxos running.
//
// What does this provide? We can have a three node cluster where we are able to
// lose a single node. We are unable to lose more than a single node because
// with two instances running there is none to break a tie in Paxos.
//
// For a basic failover H/A setup we can run Sympatico/Paxos with two nodes and
// run just Paxos on a tie-breaker node. If you want to run three
// Sympatico/Paxos nodes and be able to lose two at one time, you need to run
// two tie-breaker nodes. For our data center applications, all nodes should be
// in different data-centers, whether Sympatico/Paxos or tie-breaker Paxos
// nodes. The network latency of the Sympatico/Paxos nodes will affect the
// performance of the atomic log, but the tie-breaker nodes are only used to
// resolve administrative issues, (we could call this a control plane,) and
// latency is not as important. The tie-breakers could live on the smallest
// instance size available in a cloud provider.
//
// TODO Wondering if Paxos can run independently, on three to five nodes and
// Sympatico can run of 2 or more nodes. Oh, look the next paragraph says this
// is so.
//
// Finally, you could run three Sympatico/Paxos nodes and accept that you can
// only lose one at a time because of the Paxos quorum. Finally, we could
// completely separate the control plane from the data plane and have Paxos run
// separately from Sympatico and have 1 or more Sympatico nodes with no upper
// limit.
//
// For a proof of concept we will do the three Sympatico/Paxos nodes. We'll
// return to the other options when we consider our packaging.

// Ultimately, it would be nice to have the ability to scale like MicroK8s where
// worker nodes arriving in a different data center register and that second
// data becomes a failover. In this case, the second data center would run
// a Sympatico/Paxos and a tie-breaker so that the event of a failure of the
// primary the secondary can vote itself the leader. (Oh, wait, but in the event
// of the failure of the secondary, the primary freezes, so nope, we really need
// to spread things out. Maybe we can offer a control plane service to get
// people started quickly and offer a hosted control plane service to fund
// development of the algorithm.)

//
class Register {
    constructor (id, publisher, consumers) {
        this._id = id
        this._queue = []
        this._version = 0
        this._sending = false
        this._backlog = true
        this._leaders = []
        this._leadership = []
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
    // else filter out subsequent requests by the cookie. (We can filter it out
    // by a max id so that multiple members can suggest.)
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
    // question of topography where you shard two instances of Sympatico such
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

    // "Failure while growing is tricky..." That's true. We are talking about
    // failure here, not an event that can be scheduled deterministically while
    // reading the atomic log. You're in the process of expanding your quorum
    // and one of the participants dies. What's the problem? Suppose it is a
    // question of whether the new quorum member is going to still become part
    // of the qurom or whether we back-off and try again later.

    // ---

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

    //
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

    //
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

        // We send leadership messages as system messages, a separate collection
        // from user messages, but still part of the frame element structure.
        const system = []
        if (this._leadership.length != 0) {
            system.push({
                method: 'leadership',
                id: this._id,
                leaders: this._leadership.shift()
            })
        }

        // Create a packet to send to all of our peers, but not ourselves.
        const envelope = {
            to: this._leaders.filter(node => node != this._id),
            leaders: this._leaders.slice(),
            version: version,
            node: this._id,
            messages: {
                system: system,
                user: messages,
            },
            receipts: [ ...this._received ]
        }

        // What is the difference between `this._frames.set` and `this.receive`?
        this._frames.set(version, {
            version: version,
            leaders: this._leaders,
            messages: new Map,
            receipts: new Map
        })

        this.receive(envelope)

        // Send the message to our peers over the network.
        this._publisher.push(envelope)
    }

    // Assuming a traditional Paxos on a low volume network. If a leader sends a
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

    // REVISIT &mdash; What? If two leaders, can we call them nodes instead of
    // participants, call the doggos, I don't care, just not leaders, send
    // messages and get acks from three...  Two dudes send messages and three
    // dudes ack so we now have two dues thinking they have the frame, but they
    // don't because they didn't get each others messgaes. It must always be
    // unanimous and this is wrong.

    // But, if all we are sending is the maxium frame, then how can tell our
    // peer in the traditional Paxos that, yes, we know about the message we
    // just sent you? This one particular message is known to me, now it is
    // known to you. You inform me as such and when I recieve my acknowledgement
    // from the other leader I can learn this frame. You have to wait for the
    // acknowledgement from the other leader.

    // This it is the case that we must include in our receipts a map of
    // versions to a map of nodes to a set of responses we've received, but only
    // if those responses are to envelopes that contain messages.

    // REVISIT This is so useless. Obviously sketching things out. Delete it.

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
            for (const message of messages.system) {
                switch (message.method) {
                // Here we assume that we will only ever grow.
                case 'leadership': {
                        if (this._sending) {
                            this._outbox.push({
                                to: message.leaders.filter(id => !~this._leaders.indexOf(id)),
                                version: version,
                                node: this._id,
                                messages: frame.messages.get(this.id),
                                receipts: [ ...this._received ]
                            })
                        }
                        this._leaders = leaders
                        break
                    }
                }
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
