## Thu Sep  9 13:52:22 CDT 2021

Everyone running at once is too hard to fathom. I don't see how blocking all
traffic everywhere doesn't cause problems. It seems like it is going to be
harder to model and unit test. Finally, if a departure means we rebalance when
we recover and ignore the previous balancing instructions we don't have to worry
about losing the leader.

## Thu Sep  9 01:20:20 CDT 2021

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

Sympatico uses map/reduce to track operations. When we send out a message we
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

## Sun Aug 29 16:15:53 CDT 2021

Although I can see the transformation of the tables and the buckets in my head,
I'm not able to see how to implement them.

Let's say we move a bucket from one instance to another. The half-Paxos will
expand the government to include the new members of the government. Then it can
either abdicate, write a new government with a new leader, or it can be usurped,
in that the new leader can propose a new government and take over. This is
something I thought about a lot. It would be easier to control the transition
from a single instance, rather than have one instance initiate the expansion and
another instnace take over and usurp.

Then I realized that after the new leader takes charge, it is the only one
capable of pruning the old members, so the control does have to transfer from
one instance to another.

This is difficult. Who is really in control? Do we have the two instances
colaborate, or do we have the leader do coordination.

Now, we have decided we want to do these trasitions one at a time so that we do
not double the load on the system with a bunch of musical chairs. So if the
leader dies and a new one takes over, how does it know where we left off?

My thinking on these matters is seriously muddled at the moment. In the end it
will be a complicated system, logical if you look at it in its component parts.

Since we are using the Paxos atomic log to coordinate, everyone can maintain a
model of the redistribution process. The model can be issuing orders and the
leader can be the one to enqueue those orders. Therefore the model needs to
issue these orders synchronously. We can't pump into a Queue and read the queue
synchronously. Feed the model a message. It has a synchronous queue of outgoing
messages and when you're done feeding you shift that queue. If you are the
leader then you enqueue. You count on islander and whatnot to ensure that this
message gets forwarded.

But there is still loss. A race for a leader crash. Everyone reads the message
and drops it except the leader who enqueues it and then crashes. Now we are
stuck because the new leader is never going to get the done message that clears
the message from the stop of the queue.

We need a special queue that will keep the top message. If we see a new
government we replay the stop message. We only ever repeat the top message. It
has a series number and we ignore duplicate messages.

Now, as for the coordination.

We now have a machine that says how we are supposed to transform and rather than
having the maching itself call our half-Paxos, we will pull messages out of the
machine and use Paxos to distribute the messages. This is the right thing to do
and thinking otherwise is too much work, re-inventing our atomic log.

That machine has a top message and that message can be repeated.

That machine, as we iterate through it will have buckets that model the
governmets as they should be. Currently I'm thinking of them as a model of what
is running, but it is not. It is a model of a transformation. Rather than
modeling the stages, bootstrapping, splitting, migrating, etc. It should create
a series of commands. First bucket 2 expands to include bucket 18. Then bucket
18 usurps. Then bucket 18 contracts.

So, we do need a model of this transform because we may lose a participant and
we need to know who the leader is. Do we fall backward or do we fall forward.

We have two transofrmations split and migrate. If we fail in the middle of
migrate we fall back or fall forward. It ought to be simple enough to know how
to recover from a failed state. There is a switch that flips and we are either
in the old bucket position or the new bucket position and recovery is recovery,
extend then possibly usurp.

For split, we send a message to abdicate half our kingdom. This is trickier.
When do we stop forwarding messages, start forwarding messages. What if we fail
but we are...

Okay, so prior to doing a split we need to allow messages to back up outside of
the internal promised queue and drain that queue. Then we don't have to worry
about renumbering messages or forwarding them as part of half-Paxos. We might
even enqueue a message with a callback, that is, we're going to reduce the
complexity of half-Paxos, so maybe it can do more work.

## Sat Aug 14 06:23:13 CDT 2021

Key are going to apply to submissions to this conensus algrithm, it needs to
determine which leader to send a message to, but when we snapshot we are going
to want to have the snapshot produce a key and value and null key would
mean that it is some sort of meta information like a count or a version that
ought to be shared between both versions.

## Sun Aug  1 19:25:59 CDT 2021

Expanding buckets. We can do this the way we do it in diffuser, growing by
doubling. When we double we can't simply duplicate. We have to go through a
growing step first. We expand to the doubled location with its new left and
right backup, but when we send the snapshot there is a key, or hashed value, or
something along those lines, and each entry is inspected and only added if the
key is correct for the new bucket. We already have a key for the messages. These
would be keys that identify the objects built by the state machines, say, for
example, entries in a key/value store.

This would occur before redistributing the buckets to a new machine. So the
bucekts would be on the same machines, duplicated. We may create two completely
new instances of the consensus algorithm so that we copy the data completely out
of the old storage into two split stores, rather than telling the user to okay,
go ahead and delete the the old stuff. We could do it one at a time, perhaps.

This is complicated, though. When we write the documentation we'll have a notion
of exactly how much paritioning logic is exposed to the user. If it is a lot,
then we can go ahead and add this without to much documentation costs.

Until then we can suggest a fixed number of buckets, like 1024, and the user
ought to have some sort of failover strategy that is regional if we're talking
about having 1024+ paritcipants in a consensus algorithm, so maybe they can use
that instead.

## Sun Aug  1 18:54:32 CDT 2021

I'm move the details of growing a consensus out of the consensus algorithm. It
will implement whatever majority you give it, no questions asked.

THe logic for determining the steps will be external. This simplifies the
implementation.

Another simplification is taking the last submission, register value or
committed value and stuffing it into the new government. Need to make a note
that the committed value is necessary because we may be taking leadership and
our remaining member may have the value only it its register and we're going to
overwrite the register when we push our new government. That is, the other
member got the write but did not get the commit. We got the commit so our
register was cleared. This value has been learned by the wider world so we must
preserve it in our logs.

Currently considering building on the Paxos promise to create a three part
promise but it occurs to me that we can easily maintain an ever-increasing
series number in Paxos, so I ought to back that out, work on keeping this
somehwat simpler, less to document there and easier to explain in the
documentation.

Got ideas for how we move buckets around. Can see that is should be done one
bucket at a time. This way, the expansion from 3 to 6 participants is no longer
something to fear. It will be happening one at a time, not en masse. Migration
is much more fiddly.

Departure is still quick, though. Everyone just slams down to the smaller
majority.

Recall that you go from old majority to combined majority. If a machine is lost
during this transition you can just go to the old majority or a subset of the
old majority if one of the machines is in the old majority. When the new members
acclimate you can then switch the leader. If an error occurs before the leader
switch you can move to the old majority. After the leader switch (this all runs
through the Paxos) then you can remove the difference of the old majority. Now
if any error occurs you fail to a subset of the new majority.

Possibly new leader ship can pull the queued entries, possibly. Some entries
must be lost though. New government gets written to register. We can say that
having a new greater government written to the register will pause the old
leader and the old leader will send its queued messages. Any messages arriving
before the next commit can be dropped. Or else we can go ahead and start
forwarding requests, but we really have to change our thinking. We assume that
when we are told that we are the new leader it is so. We also have a race
condition where there are forwards but we haven't become the leader yet, we
might still be pulling the existing queue from the old leader, but the old
leader is sending us new messages to queue via forwarding.

Or we can just 503 for a wee little bit. As always, you're not going to know if
you've enqueued unless you inspect the stream as it is built, so we are probably
better off relying on that behavior in the client generally so it gets exercised
more often.

TODO Add a retry count in the outbound Islander messages. That retry count can
be used to as a multipler on a back-off.

## Sat Jul 31 23:46:43 CDT 2021

Coming back to this and looking to remove the application of routing messages
and to simply have the partitioned two-phase commit. Applications can be built
atop this.

Offhand, I'm going to stipulate that we don't accommodate shrinkage. Not as a
matter of course. I can't really imagine a production implementation that would
happily shrink in size due to gradual failure. When you lose an instance it
ought to be replaced and if it isn't replaced then you ought to be notified that
something is terribly wrong with your cluster. To rebalance the participants
across multiple machines and then wait to expand, it creates more work to do the
rebalancing, especially if we are trying to keep this simple map of left and
right in arrival order. When a new particiant arrives to relieve the load we can
slot them into the spot where failed participants are missing.

Also, I want to translate the layout table to simple list of majorities rather
than plucking them each time. Would be easier to assemble in testing.

Growing does require a rebalance to keep this simple distribution based on
arrival order, but the assumption is that you have the capacity to grow, to do
all the shuffling necessary and that you're running normally so you have the
time.

Then you have this partitioned two-phase commit and something like Diffuser can
have a relatively zero downtime unscheduled departure, and partitioned so that
only a subset of the participants return errors during the departure.

Also, no intention on preserving the submission queue for departed leaders.
Departed followers could be more challenging. We could get a new government and
resubmit, which is what we do in Paxos, and maybe someday we shall, but for now
we should probably give up if we can. Can we? If we have successfully written
and then we want to give up then how do we erase what we've written. Okay, so
this is probably not the way to go. Recall that we don't know if something has
successfully written unless we see it coming.

Seem to recall how this works in Paxos though.

## Tue Sep  1 01:44:57 CDT 2020

Returning to this project trying to determine why I'm syncing a backlog. What is
the backlog for? What is the diffrence between a backlog and a snapshot? Isn't
it the case that we want to have an attached application? That application can
consume the messages and it should have its own out of band synchronization?

In designing this I'm imagining a message queue, where each submission is
actually a message in a stream, and that's fine, we can do that. Just have the
application manage the stream and forward the backlog. Paxos doesn't forward a
backlog. Someone joins at a specific government and there is no backlog.

Now I'm wondering if there is a way to adapt Compassion so you can write an
application that uses either Cowoker or Paxos directly.

## Sat Feb 15 18:40:19 CST 2020

Designing join and rebalance with an assumption that this won't overlap. Need to
come back and create a list of rules and give them names that can be referenced
in subsequent rules.

## Thu Feb 13 12:53:22 CST 2020

Enqueue into Paxos needs to be a queue for visibility and it needs to block the
caller. Which means Turnstile or Avenue, but maybe not. Seems like we can keep
our loop of writes running and have our backlog and that can expose our count.
Because everyone is going to have to wait, that can't be done without creating a
queue in Node.js loop, so we may as well leave it there.

## Wed Feb 12 01:00:47 CST 2020

Ideally, I'd like to have the messages enqueued in the order in which they are
received, but there's a problem when a new routing table lands, since it will
arrive in a different order, so a leader may have a backlog of messages, gets a
new routing table that will require abdication. The new leader gets the table
first, so it begins to backlog, or else continues to forward. Well, in any case,
there is a point where messages are pooling in two places, so two messages for a
single stream could be in two queues.

We could pause forwarding for two rounds of paxos. One to pause and one to
resume. The pause begins when the new government countdown completes. The tables
switch and then then there is a countdown on the switch. Maybe it is a switch
and flush everyone pauses while the forwarding drains.

Or maybe we can isolate this switch somehow, so it is communication between the
new leader and the old. The pause is isolated by the bucket.

But, if we hop more than once, we have a race condition. We may not provide a
stream for HTTP. There is no stream there, is there? But, for the persistent
connection, yes, that is a stream. And because we're sharded, it is distributed,
so it does involve everyone, but we can pause and resume a bucket at a time.

Whatever trickery we're using to ensure that messages follow a single route
through the the cluster can be broken up by bucket. More rounds of Paxos, but
less chance that a bad government will cause everything to freeze.

And yet, that it spans the entire cluster means one bad actor can pause all
buckets. A server going down during this pause would have to wait for a Paxos
timeout and a removal in order for messages to resume.

We could go so far as to back-pressure into the client, too. That's a
complicated option, but still and option.

There will always be one path though. Where ever the persistent connection lives
it will move from the old leader to the new leader and it will do so atomically.

The old leader will forward to the new leader while it still gets messages,
anyone flipping, ah, at the moment of that flip, that is the race. Send one
message to old leader, old leader forwards. Now send next message to new leader.
Now we have a race.

Unless we do not queue a new message until the previous one returns. Then we
have to wait for the hop. So even if we flip, we can't race. Send message to old
leader, old leader forwards, we get new table, but we don't act on it until the
forward returns. It only returns when the hop is complete, so the message is in
the new queue.

## Initial

Essentially, we get a new arrival and we migrate to it. Everyone gets the
arrival and generates a new routing table. They take snapshots of any of the
buckets that will transfer to the new participant. The new participant see its
own arrival and obtain a copy of the existing table, generates the same new
routing table.

A routing table is used to determine the location of the leader and the location
of its followers in a half-Paxos that has a government assigned by edict. The
routing table will allow for a socket to open on any participant. It then hops
the message to the leader. The leader replicates the message to its followers.
It returns an okay to the sender through the hop that found the leader.

We have routing, writing and committing as basic messages in our system.
Snapshot transfer of existing state occurs at the application level. More on
that below.

Note too, that when I say application in this document, I do not mean a user
application. I mean our application, a message broker or a key value store.

Okay, so routing tables are deterministic. Given an order of arrivals and
departures, we'll always be generating the same routing table.

We use Compassion to have the arrivals with snapshot transfer. All new arrivals
receive a snapshot of the existing table. They then generate new tables in the
same order as all the existing participants.

The tables contain buckets. There are many more buckets than participants. When
we rebalance the load we are reassigning buckets. Our routing table routes based
on a value, and id of some sort, hashed and a bucket selected. Their is a table
that says which participant contains the leader of a half Paxos.

Half Paxos means that we have the majority only. Not minority. No voting on
collapse. The governments are formed by edict by the table generating algorithm.
This Paxos will not do it's own departure detection. It will rely on the true
Paxos that is generating the atomic log that drives the table generating
alogrithm.

Generally, a leader will have two followers. We do a two phase commit between
the leader and the two followers. The leader writes to the two followers. Once
written, the leader sends a commit to the two followers. Under load the commit
can be sent with the subsequent write, so it is two phase, but the write doesn't
need to wait for the commit to complete before the write can be learned by
clients. The leader can mark the write as committed instantly, in memory, when
the write returns from the two followers.

NOTE: Yes, this is okay, because there will be complete failures, where we've
said something is committed, but it is lost. If we lose all three instances at
any point, we lost, if we lose three disk drives at once we've lost. If you
really want to ensure that you've committed to a Reed-Solomon protected store,
maybe use this system to send two messages.

The half Paxos will run for all the buckets of the leader. The leader's two
followers will be followers for the same set of buckets as the leader. That is,
we do not have a half Paxos per bucket.

Let's assume we have a three or more instances running so that the full Paxos
will survive a participant failure, so we're discussing normal operation. In
production you'd want at least five. A loss can be survived for half the largest
odd number in a collection rounded down.

And so, on arrival we generate a new table by taking a bucket from each existing
leader and assigning it to the arrival. The followers are to the left and the
right of each leader.

Looks like I need to take that back. There *is* a half Paxos per bucket. During
normal operation the set is the same, but during a transition, we need to use
the half-Paxos to migrate.

So, for every bucket that will migrate on an existing participant, a new
government is formed. That government will be added to the atomic log managed by
the half-Paxos. The followers and the leader will then tell the application to
take a snapshot of the application state for that bucket. Maybe just the leader
takes the snapshot, though. (Let me think.)

The new leader and new followers are added to the list of followers for the
existing leader. They begin to receive writes and commits. The first write they
receive for a bucket contains the new government that make them the new, uh, I
don't know, overseers. The new administrators. (They are not a parliament
because they do not vote.) With that government they give it to the application.
The application framework will connect to the leader and request the snapshot
for the bucket created by the application on the leader. When the snapshot has
been transferred the new administrators begin to process the messages processed
by the existing government.

The new routing table does not take effect until all of the new administrators
have the same table and they have all transferred their snapshots. Thus, existing
leaders who are surrendering a bucket will create a new government and sent it
to followers and new administrator-followers. New administrators will receive
this half-Paxos government and copy snapshots. When all the snapshots have been
both taken and received for a participant, the participant will send a
completion message through the full-Paxos. This will be received by all
participants. The participants will use these messages to countdown from the
number of participants to zero. When they reach the countdown, they switch to
the new version of the table.

This introduces a race condition as the countdown will occur almost at the same
moment, but not quite. Given the traffic, we can expect that there will be
routing that is based on one version of a table reaching a participant operating
on another version. When this happens the routing, writes, commits, etc. are
rejected and the user will receive an error. The user must retry their message.
It would be the same as any gateway error, a 503.

Which brings us to an important point. Anyone using this system needs to program
clients that retry to maintain their stream of messages. We might require they
maintain a series number as well, so that we can eliminate duplicates. We might
provide both a TCP client for devices, and a specialized HTTP client, a wrapper,
for the server-side. At some point we may say that the stream for a device has
been broken and the device has to reconnect and sync state. This is a case we
explain to the user. That we're providing a stream, but streams break.

Ideally, we're transitioning quickly enough that retries within a server program
do not cause retry timeouts. When we do have an outage, we can expect a stampede
when the connections return.

When everyone switches to a new table, the existing snapshots can be discarded.

If a new arrival occurs while we are transferring these snapshots, we simply
abandon the current transfer. The snapshots are not discarded because at the
half-Paxos level, someone might be waiting on a bucket transfer. We'll do bucket
transfers one at a time a break a loop if there is a new arrival or departure.
This can happen in parallel.

If we turn on eight instances in at once, going from five to thirteen, the new
routing tables will be generated in quick succession, so there ought not to be a
lot of bucket transfer. Maybe one false bucket and then it checks back to find
that a lot of new governments have come and gone. It will not be costly.

We want this quick abandonment for departures. When we have a departure we want
to immediately transition to a recovery state, promoting one of the followers as
a leader. Then generating a new routing table that distributes the load dropped
by the departed participant evenly to the remaining participants, or entirely to
a reserve participant. In one atomic calculation the participants will calculate
the departure table and adopt it immediately with the depart message, so their
is no need for a countdown, then generate a new arrival table and migrate to it
with a countdown.

Strikes me that, if abandonment is going to be critical, we may as well make it
the default.

Not that on departure we have a case where a leader might write messages to
followers but not commit them. When the follower is promoted to leader it will
not know if the last write it recorded have been committed or not. It will
have to treat the write as committed. It will write the write to the remaining
follower and then write a commit to itself and the remaining follower.

It may be the case that one follower has a write and the other follower does
not. If one follower is promoted, the write is committed, if the other follower
is promoted the write is lost. This is fine though, because no one ever learned
about that write. The leader could not have committed it because one of the
followers didn't get the write.

For the IoT device, the retries are simple. The device is long lived and a
single stateful application. It can record a series number and we can reject
duplicates in the series.

For the server side application, which is stateless, we might have a case where
something it wants to say is lost. Their may be a retry timeout. It never
informs the device about a state change.

This means we're kind of depending on the server-side programmer to do the right
things in regards to retries. A better model in the near term might be to
preserve a state document in our service that the server-side application can
inspect.

Another model would be to call the server-side service with a cookie and have it
modify a key-value store using that cookie. When the server-side service returns
a 200 we commit the changes to the key-value store, otherwise we discard the
changes made by the server-side service.
