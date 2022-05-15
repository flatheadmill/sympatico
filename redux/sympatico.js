// ## Asynchronous Followers / Warm Standby
//
// Current strategy for asynchnrous communication is to send messages in
// batches, well, just send them off the log to a follower. When a new
// participant joins they are in an asynchronous mode accepting messages from
// the point where they've embarked. We will add a system message that indicates
// that a follower has arrived.
//
// Or do we want this? Essentiall

// Recall that we need time for a new arrival to acclimate. If we have a key
// value store, a new participant will need to fetch a copy of the exsiting key
// value store from another node. Until it has a base object it cannot modify
// that object.
//
// I've imagined that it would be necessary to allow that new node to run as a
// follower and not participate in Sympatico, but now I question why. Could it
// be that you're concerned that this follower is part of the leadership, but
// not really able to garauntee that it can act as a durable replica if another
// leader goes down? Well, this is the case regardless of the method of
// transfer, whether it is participating in Sympatico or not. The acclimated
// state can be reached using Sympatico or using some form of streaming.
//
// This was probably the result of over-thinking. It would make some sense to
// keep this new node our of the leadership, have it obtain a copy and play
// forward, and ensure that it does get caught up, but all of these concepts can
// be conveyed in documentation and the state can be tracked and recorded
// through Sympatico. Acclimated means that the node has obtained its
// out-of-band copy of the state and replayed the log to zero at least once. It
// would then submit an acclimation message and our CLI would report this node
// as healthy.
//
// In previous projects, I'd always assumed an arbitrary number of followers,
// each one waiting in the wings for their turn on stage, but I now assume that
// you will have exacatly the number of participants you need to obtain
// concensus and no more, you'll monitor them and make them ready.
//
// Having a warm standby does seem appealing, however.
//
// Let's imagine we have our synchronous followers. They get get a copy and they
// process a stream to near zero. How do you promote them. Simply put a
// promotion message into the queue and add them to the leadership. They start
// to get Sympatico messages and write that to their Sympatico log. That log
// just builds up while they continue to read the asynchronous log. In the
// synchronous log they will see the message that promoted them and they will
// exit the processing of the synchrous log and start a loop to process the
// Sympaico log.
//
// Similarly, the sender would have an array of followers it is supposed to
// inform and when it see that the follower has been promoted it removes that
// follower form the array.
//
// Simple enough, but then we get into the problem of tracking followers. Now in
// addition to detecting the departure of Sympatico nodes, we need to detect the
// departure of followers? We have to keep a backlog around waiting to see if
// the follower will return. We have to flush the backlog based on the
// followers, assign followers to leaders, all that we'd done before.
//
// Can't this be an application problem? Let the application maintain a backlog,
// follower counts, of keep the last 15 minutes, or last 1000, log messages.
// This is a requirement of `etcd`, to have a backlog of messages, the same
// backlog could be used to maintain a warm replica. It would be up to the
// application to replicate its base state out-of-band, and this could be a way
// to do it. Oh, base state, I just happen to have a copy right here.
//
// A data center would have a warn standby reading the log from the Sympatico
// node running the user application. The Sympatico node goes down, and so it
// joins and gets its arrival message. It then asks the user application on
// Sympatico node in another data center, not for the entire base state, just
// the message since the Sympatico node went down. Hopefully, the loss of the
// Sympatico node and the replacement has occured in the last 15 minutes, 1000
// messages or some other static backlog size.
//
// Ergo, yes warm standby, no asynchronous followers built into Sympatico.
//
// ## Embark / Depart
//
// I'd imagined that embarcation would be submitted by everyone and we'd take
// the first one, but that doesn't make sense. We can easily choose a leader,
// perhaps simply the oldest node, the one wtih the lowest id, is always the
// leader and it will run service discovery. This would be external to
// Sympatico. Arrival messages do not change who is performing the polling, only
// departure messages. The bootstrap starts polling and stays polling. No change
// until it leaves. It's departure probably means failure or shutdown so you can
// kind of assume that this will simplify telling it to stop, simplify
// determining who should start.
//
// So, now how do we trigger departure. As noted, we'll see that a frame has
// frozen. Timer, eh? And then we run Paxos to determine who should be removed
// from the quorum.
//
// Does Paxos have a queue feeding it? Not really. A freeze is a freeze. All
// Sympatico participants will be frozen on the same frame or roughtly the same
// frame. In fact, they might all agree on who to remove. It may be the case
// that we have a special Paxos algorithm where if two nodes accepts the same
// value it doens't matter who submitted it.
//
// Timer, I haven't heard from X for this frame in 30 seconds. Submit either a
// remove X or new quorum with X removed. Probably the latter since we'll want
// to be able to remove up to minority count at once.
//
// Then we get a new quorum and the code below will be able to procede with the
// new quorum.
//
// As always, Paxos will resolve two nodes that are alive, who cannot reach each
// other, but who can reach all other nodes. They will be trying to vote each
// other off the island. Pretty sure one of them will always win and one will
// always lose, Curious case of five nodes, with a mix of single can only reach
// two other nodes. Basically, what are the cases where a majority might not
// agree on who is supposed to leave and does that cause a round of Paxos to
// fail?
//
// Since we are always performing a round of Paxos on one of two frames, is it
// the case that we do not have a Paxos singleton, but instead create a Paxos
// object for that single frame? What frame number do we use, the lesser or the
// greater? What can we do now and what can we kick down the road? Does
// splitting it by frame number help? If you have a single frame you can assume
// that you're voting on the next frame. Even if no one has created the next
// frame it is a safe assumption because the next frame will begin as a
// universally single frame and you vote on the frame after that. (Good,
// resolved.)
//
// And Paxos is Paxos. Yes, it can fail and you have to try again.
//
// Now imagine you have five machines. Dray out a pentagon. Starting with the
// bottom left draw four edges connecting the nodes along the perimter. Now you
// have a network condition where Paxos would succeed but Sympatico would not.
// Sympatico must have a connection betwen all nodes but the top three would
// each be able to connect via Paxos and create a new smaller quorum that still
// doesn't work, and their may have been a recoverable edge in a possible quorum
// that was lost. So, now we need to modify our Paxos to reject a proposed
// network that node receiving the proposal could not participate in.


//
const Register = require('./register')

class Sympatico {
    constructor (id, publisher) {
        const consumers = []
        this._register = new Register(id, publisher, consumers)
    }

    // TODO We are going to use a method of service discovery to probe endpoints
    // and join which ever assembly is healthy. If we are not able to find a
    // healthy assembly than we will wait until we can receive a definitive
    // answer from every entry in our seed and if they are all unhealthy we will
    // choose to bootstrap with the members that has been running the longest.

    // Perhaps in this case we can run a unanimous paxos of some sort, so that
    // we can be assured that we're not starting a consensus on the oldest and
    // the second oldest.

    // Considering how I'd implement discovery at the moment. Would initially
    // simply be some sort of DNS SRV record, maintained externally, for a set
    // of three machines, so basically the Mingle SRV strategy. What we'd get
    // from that is a set of IP addresses and we'd use it to do any probes, make
    // any decisions, then tell this object to either bootstrap or join. When we
    // do tell it to join we'd be telling it to join by giving it the address of
    // leader, I suppose, okay so this is where our Sympatico algorithm takes
    // over.

    bootstrap (leaders) {
        this._register.appoint([ this._id ])
    }

    join () {
    }
}

module.exports = Sympatico
