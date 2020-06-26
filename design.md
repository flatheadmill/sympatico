Coworker is a sharded Paxos. It manages atomic logs across multiple processes
that reside on multiple machines by sharding the atomic log on an identifier.
The sharding is bucketed. The atomic logs are processed by a two-phase commit by
a leader of a consensus of an odd number of processes. The odd number is
initially set to three so we can lose at most two processes and still maintain
the integrity of an atomic log.

Currently, the odd number for consensus is hard-coded as three. For each bucket
there is a separate instance of the consensus.

A three-member consensus is maintained for each bucket so that we can lose at
most two processes and still maintain the integrity of an atomic log.

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
