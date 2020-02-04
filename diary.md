Essentially, we get a new arrival and we migrate to it. Everyone gets the
arrival and generates a new routing table. They take snapshots of any of the
buckets that will transfer to the new participant. The new participant see its
arrival and obtains a copy of the existing table, generates the same new routing
table.

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
