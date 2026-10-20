# Pre-send logical deadline and in-flight timeout

The old test assumed its 100 ms logical deadline always allowed one HTTP request.
Runtime includes reservation and event persistence in that budget. The fixture now
uses the public `WorkerConnection.connectWorker` seam to delay the real reservation
return by 150 ms. Other host methods stay bound to the real control plane. The
recovery worker uses the original connection without the delay. No product model
deadline or runtime implementation changes.

On published 3.5.5 / Node22.23.3, both owning tests passed (2/2, no skips; 7.05s).
The pre-send turn made **zero** HTTP requests, settled one timeout, emitted one
failure notice, then a new human turn succeeded. Its actual Worker elapsed time
was 437.77 ms. The separate in-flight fixture received three local HTTP attempts,
observed all three transports disconnect, and settled three failed calls in
1353 ms. Counts are measured, not substituted constants. Typecheck and lint passed.

This corrects the fixture contract; it does not attribute historical failures to
a proven production incident. Earlier failed/diagnostic evidence stays unchanged.
No live provider, billing receipt, browser, long soak or production fault injection
was attempted. This fixture does not bound arbitrary slow reservation SQL; that
is a separate database operation deadline concern.

Reproduce after PR207's isolated launcher is present:

```sh
PROVIDER_MATRIX_OUTPUT_DIR=/tmp/deadline-boundary-unique-output \
  node scripts/runtime-acceptance/provider-fault-matrix.mjs \
  runtime-deadline-recovery.test.ts runtime-provider-timeout.test.ts
npm run server:typecheck
npm run server:lint
```

The actual run used an otherwise identical copy of that PR207 launcher in `/tmp`,
with the worktree and `pg` import resolved absolutely, and the reviewed
`RUNTIME_ACCEPTANCE_OUTPUT_DIR` forwarding enabled. The first passing run with
the old output location is retained separately; its tracked historical receipt
was restored, and the test now writes a new temporary receipt with exclusive creation. The execution receipt lists
the commands, test database and successful deletion. The log includes expected
control-stop messages during teardown, with no failing assertion.
