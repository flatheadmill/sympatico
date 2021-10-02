Coworker is a paritioned atomic log. It manages an atomic log atomic log across
multiple processes that reside on multiple machines by parititioning the atomic
log on an identifier. The paritioning is bucketed, so it is not dependent on a
fixed number of machines. The atomic log partition is processed by a two-phase
commit across a subset of the machines so that if a mahine goes down, one or
more hot backups can take over the processing of a partition.

The paritioning is managed by paxos. Paxos provides an atomic log that is used
to coordinate the distriubution of partitions, increasing the bucket count, fail
over and rolling restarts.

The other members are chosen by selecting the left and right processes in the
order in which they arrived, wrapping at the ends of the array.

How are the buckets managed? Is there a consensus for each bucket? Or is the
consensus managed at a process level?

TK Client submit messages via HTTP or a similar call and response mechanism.
We'll use HTTP terminology to describe thier communications, but we could use a
different form of windowing protocol. Also note that messages could be batched
to form windows and increase throughput.

Clients will maintain a series number and mark each message with an ever
increasing series number. If necessary the series number can wrap at a certain
point. This can be negotiated as part of the handshake, max number, wrap range.

Clients will receive a connection number that they must submit that identifies
the series so that the server can distinqush a new series from breaks and wraps.

Clients will submit a message and expect a 2xx response. Upon receiving the 2xx
response the client can discard the message, it has been successfully entered
into the atomic log.

If the client receives any response other than 2xx, it will resubmit the
message.

The algorithm is broken up into hopping to find the consensus leader, then
running the two-phase commit. Throughout this document we'll discuss whether
failure situations we encounter are resolved through further hopping or through
consesus messaging.

TK Hopping should go here, since we depend on hopping to perform messaging.

The consensus algoritm is a two-phase commit. We count on an external paxos
altogrihtm to detect missing instances and remove them, so the consensus
algorithm does not manage consensus itself. (It should perhaps be called
something else.)

The consensus alogrithm must deal with four state changes. Growth of the
consensus, relocation of the consensus algorithm which includes a change in
leadership, the departure of a participant, and the departure of the leader and
a change in leadership.

The first two instances address the challenge of acclimating a new members to
the consensus, forwarding the existing log to a participant that has no history
of the log, the last instance must deal with a participant siezing the
leadership position.

When a new government is created for a bucket it is given to the consensus
leader. If the government contains only the leader than this is a boot or reboot
of the consensus. The the leader reverts to it's initial state with a series
number of zero.

Otherwise, the leader extracts the new members from difference between the old
government and the new government. The leader continues to process requests with
the existing government until the new members are sync. When the new members are
within some reasonable range, they begin to participate, say the final three
synced messages are followed by the first parital write.

Acclimating new participants is simplified by coming from the leader which will
always have the latest state of the log and can transition them from syncing to
participating by appending a half-write to the log.

When the leadership is relocated, and abdication is performed. This is done my
merging the old government with the new government, but retaining leadership.
This will acclimate the new government members including a possible leader
through the synchronization method for growth. Once all participants are synced
the leader will emit a message saying that it is ready for abdication. When all
buckets have performed this step, then the abdication can be performed.

Abdication is performed by inserting sending the new government as a consensus
message. The new leader will take control. Any queued messages after the
government are ejected back out of the leader and into the hopping mechanism to
hop to the new leader.

TODO Except that the table might have been updated elsewhere so that messages
are arriving out of order, but we've determined that messages are arriving one
at a time from clients so that the worst thing we can have happen is that we get
a duplicate.

The purpose of two stage abdication is that we may have a departure. If we do,
then we need to fallback to an established leader. After all synchronization has
been complete, we fall forward to the new leadership. Note that, this may cause
a case where a government in the process of abdication and the new leader gets a
message to usurp before it is handed leadership by the abdicating leader.

In the event of the departure of a participant, the leader simply needs to stop
sending it messages. If there is a message in flight, it needs to know to recall
the message, so the transport layer should not retry itself, but instead return
the message to the consensus to resend.

In the event of the departure of a leader, a new leader will be appointed by the
paxos algoritm. The new leader will simply take over and await. Upon starting it
will send some of the previous messages in the log to ensure that the other
participant is synced. The other participant ought to be no more than one
message behind the other participant, or not behind at all.

TODO The other participant could be ahead of the other participant, though, by
one and now we're going to have two versions of the log, so we need to run
through some sort of sync between the two, which would only be to exchange a
single message.

If the leader disappears, the hop to the old leader will return 503 and all the
clients will resubmit their messages.

After a hiatus, you returned to this project and thought that since you need to
usurp for a loss of leadership, it would be easier to just usurp in all cases,
the logic being you already have to usurp, so you may as well only implement
just this one case. You can see above that usurping is only effective for an
already up-to-speed participant, and that usurp is only easy because of the
synchronization and orderly migration by a leader.

Going to rewrite as of `Wed Sep 29 22:10:09 CDT 2021`.

Phasers will always pause when they receive a new appointment. When paused
messages will be added to a backlog queue. In the backlog queue messages wait
and the network request that submitted the message waits for a promise. This
allows us to use usurp logic for all appointments.

Note that "majority" is a misnomer which should be addressed.

Because we pause we do not have to worry about syncing messages. When we resume
the backlog queue is checked against the new table and the message is hopped to
the correct leader if necessary. We do not have to pass the queued messages
between participants possibly renumbering their promises.

Government are always added to the end of the internal queue. When the
government is a departure we run the existing queue omitting the departed
member. Retry logic should be handled by the phaser. The network should make an
effort to deliver and then tell the phaser the effort failed so that if there is
a departure the phaser can submit to remaining majority.

All messages are sent through paxos. (TODO Dubious ->) We can entrust state to
be preserved in paxos as well. That is, rather than maintaining an internal
index when the distributor is indexing through the array of buckets, the bucket
can submit a message indicating its index in the array and that it is done with
any appointments so that when the distributor receives the message it can use
that index and increment it.

We use a Conference to countdown acknowledgements.

All participants maintain the same distribution state using a distributor object
which is a deterministic state machine. The distributor will emit messages. They
will either be paxos messages that should be enqueued into paxos and distributed
to be processed by the participants or immediate messages that should be
processed immediately by the current participant. When the message is a paxos
message only the leader of the paxos consensus will actually enqueue the
messages for distribution.

TODO Realizing that we have a problem with broadcasts and with the Compassion
model. If we want to run an appointment through the phaser, and one of the
machines is down, we're going to block advancement of the atomic log and we're
not going to receive the depature message necessary to free the phaser from
retrying the departed instance. This is an interesting and unexpected case.

We're going to have to duplicate the countdown built into Compassion, or else
we're going to have to redesign it. Are we ever going to want to block the
advancement of the atomic log? Maybe, probably. Seems like we'd want to block it
here for depart.

This gives us too much to think about for the general cases of possible future
Compassion applications, but for our current application we know that during the
good times we are processing a single broadcast at a time.

Wait, if depart blocks, then while we are trying to react to one depature, we're
not able to deal with a subsequent departure. Maybe departure has to
introduce...  Done. Delete this TODO. We have a new Compassion now.

Sympatico uses map/reduce to track operations. When we send out into paxos we
await a response from all participants in order to determine that it has been
completed. We're going to call this a map/reduce and say that we send a message
to be mapped and act upon reduce. Kind of convoluted, but hopefully it will be
consistent through the rest of this doucment.

TODO Not sure how to process messages in our distributor though when they are
not address. The distributor needs to know that the message was handled so it
can update its state.

Departure can change the leader and our algorithm here is always reset by a
departure. Upon departure we stop processing any expansion and migration and
deal with the departure.

Each departure increments a series number. The series number is assigned to each
message when it is sent. When we receive messages with a series number less than
the current series we drop the message.

TODO Stopping migration is simple enough to imagine. It's just falling back or
falling forward in the migration. Harder to consider expansion. We end up having
a number of buckets in an idle state waiting to be build out. How do we decide
to move from one state to the next? Perhaps it is reasonable to have the bucket
inspect the previous bucket balance and the current bucket balance and determine
if it is in the correct state itself.

Actually, even with that, there is no way for the bucket to know if it has split
or not without inspecting the state of bucket it is supposed to split to.

We could have an initial bucket state, a state of idle and if split fails we
revert to idle. It would be true for the bootstrapped entry, but once
bootstrapping it does not revert, it raises and error. Thereafter, until such
time as we implement bucket reduction, which is likely never, we will only
expand so any idle bucket is one that must be populated from the bucker in the
earlier half of the buckets array.

TODO The above is good. Typed it out. On some additional pass you can tighten it
up.

Expand is as follows.

We send an appointment that expands the phaser to include the existing
majority with the new majority. The appointment will pause message processing
and the new majority message is added to the internal queue. The leader of the
existing majority will block until the appointment is successful, so that the
return from the broadcast will indicate that the appointment is successful.

When we get a return from the expansion broadcast we send a message to the new
leader to usurp with a flag to resume the backlog of the old leader which will
hop messages to the new leader.

The new leader was not paused, though. It would be referencing its bucket table
to determine the leader. TODO We could put it in a paused state with the initial
message, but that becomes a race condition. It should be in a paused state
because it is not a leader. Without sorting out how exactly, we can assume there
are races where someone is sending it messages before it knows it is to become
the leader, so maybe the queues are in a backlogged state by default.

Prior to the return of the expansion broadcast, if there is a departure we will
fall back to the existing majority. After a successful expansion broadcast
returns we will fall forward to the new majority on on departure.

 * Send a message to pause the phaser, all messages are queued in an queue
 external to the phaser so they are not promised.
 * Send an appointment to expand the phaser to include the new majority. The new
 government is added to the end of the internal queue. When it completes we
 notify that we've completed this is barrier, a successful expansion.
 * If we have a departure of a member before the successful expansion message,
 we fall back to initial majority less the departed member. If it is after a
 successful expansion we fall back to the subsequent majority less the departed
 member.
 * When we get a successful expansion message we send a message to the new
 leader to usurp and shrink to the new majority.
 * Send a message to resume the queue for the phaser at the new and old
 locations. The old location will reroute to the new location.

Split is as follows.

 * Send a message to pause the phaser, use external queue.
 * Send the new expanded majority, it adds the new government to the end.
 * Send a message when we've successfully expanded.
 * If we have a departure of a member before the successful expansion message,
 we fall back to initial majority less the departed member. If it is after a
 successful expansion we fall back to the subsequent majorities of both less the
 departed member. If we did successfully expand we must resume both... huh.
 * When we get a successful expansion message we send a message to both phasers
 to ....

Yoiks. Okay. Well, we should just use our expand as it exists and exercise
usurp, but if we are splitting we are moving to a new bucket, so the addresses
for the majority are `{ machine, bucket }` and we include the foreign buckets.
Then when we are ready to complete the split, we just usurp using the same
bucket so we don't stomp on anything. We can use our same growth logic, which is
good because it will be easier to explain to the user, create an simpler user
interface.

 * And so we send a message where both phasers usurp with the new majorities.
 * We send a message to resume the phasers. When we do this we update our
 routing table to say that yes, this guys are ready to take messages.

Departure is as follows.

 * Departure runs in a different queue, a short term queue and it blocks all
 other operations, we don't allow ourselves to process Paxos messages. Okay,
 well, we need a subsquent Paxos message to okay the new table, so everyone
 pauses on departure, does the updates where they usurp and then submits a
 message to incdicate the usurp was successful. Any messages regarding an
 expansion, rebalance or split begun before the departure are now ignored.
 * We go through all the buckets and generate new governments with the dead
 machine removed. Based on whether or not it successfully transitioned if in the
 middle of a transition. We'll only update majorities that have the machine.
 * Every bucket that needs an update is paused if not already paused.
 * The phaser will now ignore responses from dead machines, we'll have a dead
 machine set, and we'll add to it when we push the departure government.
 * Now we can put the new majority at the end, it will drain. If the leader died
 we do an usurp that will resolve the last saved message.
 * We send a message indicating that we've usurped all the necessary buckets.
 * We count down the usurp messages and when they reach the participant count we
 resume the paused queues possibly rerouting.

Bonus if we can keep the buckets uneffected by the departure running while we do
this.

If we have a spare machine we could just use it and usurp from it as necessary.
That would just take the first spare machine and have it usurp, running the
following recovery step immediately.

Recovery is as follows.

Well, I don't have this in my head. We would just expand all the truncated
bucekts to include the new entry. It would be in the same place in the arrival
array, so we might have a map that maps from one machine to the next. But, that
machine could fail, so we would have to make this an indefinate proces of sets
of dead machines and maps of old machines to new machines. Unlike the departure,
we should do this one slowly, one at a time.

But, key to recovery working without losing messages is that it would abdicate
instead of usurp.

Then once we recover we should use our buckets as they are and rebalance, rather
than trying to resume the old rebalance. If we are in the middle of a split,
then we can also detect that rather easily and continue the split.

Ordered shutdown is a matter of having spare machines and expanding to include
the machine. This requires some sort of replacement map.

Actually, if we do it this way, where we pause the queue, we can probably do all
the balance and such at once. We did it one at a time because we go from three
to six participants doubling the load across the board, but here we are only
going from three to six for as long as it takes to takes to run the new
majority. This means that the expanded barrier has to be across all machines
though. Arrival changes layout? Everyone pause. Everyone expand. Everyone
expanded? Everyone usurp.

Yeah, and we might have to double, double, double, rebalance at the beginning,
but eventually the worst will be double, rebalance. We're going to count on
Paxos running relately quickly, then we can resume.
