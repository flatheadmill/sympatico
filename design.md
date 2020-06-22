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
