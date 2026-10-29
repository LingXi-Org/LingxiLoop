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

## Product scope implementation and evidence

The product shares a two-callback gate across the three lanes. Each callback
owns one existing pool session through authorization and IM acceptance. Its
runtime calls can borrow one additional existing connection: admission is
capped by `floor((pool.max - 1) / 2)`, at most two. No capacity is added. With
the production main-pool maximum of eight this budgets four callback
connections, separate from runtime's own background/listener occupancy.

All product repository queries use an explicit `Queryable`; concurrent reads
serialize each statement's timeout setup with its SQL. The absolute callback
deadline includes admission and defaults to ten seconds for older callers.
Cancellation destroys the owned client and rejects subsequent work. PostgreSQL
socket disconnection alone does **not** promptly interrupt a running statement;
the scope also uses a server statement timeout and a maximum 100 ms
`client_connection_check_interval`. Stricter existing settings are preserved,
and successful scopes restore original session values. These are temporary
settings on the borrowed session, not server configuration changes. This
requires PostgreSQL 14+ on a platform supporting the connection check (the
fixture uses PostgreSQL 16.15/Linux).

Connection admission waits outside pg's uncancellable pool queue. If a network
handshake is already underway, the callback rejects immediately on abort and
destroys the late client without SQL. Its admission slot remains occupied until
the handshake settles under the existing five-second connection timeout.

An actual PostgreSQL baseline with unmodified callback behavior (only exporting
the observer for the test) observed eight blocked statements where the shared
budget requires two. An initial destroy-only candidate failed two of six tests:
the Node connections disappeared while the PostgreSQL backends kept waiting.
With scoped server cancellation, nine scope tests and four product callback
tests pass. The recorded run in `artifacts/callback-deadlines/scope.json` reports
eight submitted / two entered callbacks, zero remaining lock waiters and a
successful next callback while the blocker stays held, approximately 93 ms
after early abort. A 150 ms deadline-only fixture exits its PostgreSQL backend
in approximately 153 ms. These are short local measurements, not production
latency claims.

Product tests additionally exercise deep project authorization, revoked access,
cancelled acceptance INSERT, and a successful synthetic IM HTTP send followed
by a blocked receipt UPDATE. Retrying that last case reconciles history under
the original nonce; it does not send again. No callback-wide transaction wraps
the durable pre-dispatch marker.

The initial product commit remains on formal runtime 3.5.5. Cancellation of the
runtime methods listed above requires the separately reviewed public
`RuntimeOperationContext` release and explicit product wiring before the whole
delivery callback can be considered covered. No dependency lock is changed by
this product-only stage.


## Final public operation integration

The final candidate pins formally published LingxiOS 3.5.6 and passes the same
callback scope explicitly to its public reads and conversation sync/ingest.
`readRun(identity, database)` continues using the existing product session;
the other runtime methods own at most one additional existing pool session.
No private runtime API, global implicit database scope or extra pool is used.

The final short run passes nine session-scope tests, six product delivery tests,
106 server tests, three owning reliability integrations, typecheck and lint.
The two linked delivery cases use the same real runtime/worker for blocked-read
cancellation, same-identity outbox recovery and the next successful turn. They
also assert shared operation context on successful reads and conversation writes.
Their fixed 250 ms post-abort observation proves the backend is absent by that
check, not its precise exit latency. Read-approval propagation remains code-review
and upstream-test coverage, rather than an approval-event fixture here.

See [retained evidence](https://github.com/LingXi-Org/LingxiLoop/blob/351e895a315bb46b9061c8628b20d9b9fa5ffa1e/docs/evidence/callback-deadlines/README.md) for exact source,
formal package integrity, earlier red results and the final measurements. Full
production matrices, live providers and long soak are still unverified.
