# Product callback deadlines

Related to #153 and #161. The usage observer, terminal delivery and result
delivery are three independent runtime outbox lanes. They currently bypass the
runtime's background SQL admission when they enter product code.

## Failure inventory (written before implementation)

- A callback's 10-second DeliveryContext expires, but product SQL retains a
  shared foreground pool connection until the 60-second statement timeout.
  Eight simultaneous usage/terminal callbacks can occupy the production pool.
- A callback waiting for admission or a connection is cancelled. It must never
  start later, run SQL, or leak a late acquired connection. Connection handshake
  cleanup must remain bounded even though pg has no public cancel-connect API.
- The deadline expires without the supplied signal being aborted, or an older
  caller omits context. Both paths still need a finite deadline.
- A checked-out socket fails: an active pg client needs an error listener;
  destroying it and absorbing the query rejection must not crash the process.
- A write races cancellation. Unknown completion must reject, never become a
  successful receipt. The usage ledger's stable call ID and ON CONFLICT allow
  retry; IM keeps its stable nonce, durable pre-dispatch marker and authoritative
  history reconciliation. A transaction must roll back on disconnect.
- Cancellation is followed by another query, authorization check, transaction
  COMMIT, HTTP send or retry. The closed scope must reject new work, and all
  nested product reads (including permission checks) must use the same scope.
- Authorization is revoked while delivery waits. Current tenant, principal,
  project, frozen audience and request checks remain mandatory before sending.
- Reentrant delivery or concurrent work on one session could deadlock admission
  or share an unfinished transaction. Explicit scope propagation must preserve
  connection ownership and avoid borrowing a live session for another callback.
- Public runtime reads and conversation writes also occur inside delivery.
  Runtime 3.5.5 only offers a transaction argument on some methods; product code
  must not claim complete 10-second cancellation while these use a separate
  30-second runtime deadline. Any needed capability must be public and formally
  published before the product dependency changes.

## Short acceptance

Use a dedicated local PostgreSQL test database and synthetic messaging only.
Observe actual lock-waiting SQL before cancellation; verify connection/backend
release, a foreground query, and a later callback while the blocker stays held.
Cover admission, queued/late acquisition, deadline-only and missing context,
socket loss, transaction rollback, ledger retry uniqueness, IM unknown-send
reconciliation and revoked authorization. Record real entered-query counts so
an early timeout cannot masquerade as cancellation coverage. Keep callback
admission shared across all three lanes, with no additional pool or capacity
increase. Full production fault matrices, live providers and long soak remain
unverified by these short fixtures.
