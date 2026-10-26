# #439 — native Worker failure diagnostics

This change qualifies the diagnostic chain for failures after a successful
`input.loaded` event. It does not establish or fix the reported student's
business root cause. The original #439 report remains open until separately
verified after release. Old failures have no native failure event and cannot be
backfilled by this entry point. The student does not need to repeat their action
for this synthetic check.

## Failure model and owning regression

`server/src/__integration__/runtime-worker-diagnostics.test.ts` contains one
bounded test with two controlled failures:

1. A real published `createWorker` executes a native `enqueueJob` through real
   `createLingxiOS` and PostgreSQL. Synthetic context loads successfully. Its
   `policy.productRules` then throws a synthetic `TypeError` carrying SQLSTATE
   `42P01`, private body/error markers, a service-token marker and the claimed
   lease token. The expected native diagnostic is `phase: session_restore`,
   `bindingState: not_started`; no binding-save call has occurred.
2. A second native job uses the same formal pipeline. A wrapper around the
   public `HostPort.saveStep` throws once while saving `runtime.binding`; every
   other HostPort operation delegates to the real control plane. The expected
   diagnostic is `phase: binding_save`, `bindingState: saving`. PostgreSQL must
   contain no successful binding for either job.

The fixture never inserts `runtime.failure`. Both records must be emitted by
the native runtime. It stops the original Worker/control instance and reads
through a new `createLingxiOS` instance to prove PostgreSQL persistence. Native
event rows must show `input.loaded` before `runtime.failure`, both internal.
The public `readEvents` result must contain neither event nor diagnostic ID.

Assertions retain the version, UUID correlation ID, run/request/fence identity,
phase, binding state, safe error classification, SQLSTATE and bounded native
module frames. Raw error message, raw stack, original body, service-token marker
and lease token must be absent from persisted diagnostics, public events, logs
and management responses. SQLSTATE alone does not imply a retry category.

The existing real platform/company HTTP routers check the authorization
boundary. A platform operator can read the same `workerFailure` via run detail,
the `content/workerFailure` field endpoint used by resource-content readers,
and run operations. A company administrator can still read an authorized run,
but receives no `workerFailure` or nested `diagnostics.runtimeFailure`; the
content endpoint cannot recover it. A synthetic product run binding exists
only to exercise this redaction boundary.

The jobs use native internal operation admission with synthetic context, no IM
ingress and no delivery adapter. The product reader is passive. Every model
method fails if reached and the test asserts zero calls. Fetch is limited to
the fixture's own numeric loopback HTTP endpoint; no WuKongIM message, real
provider request, student action or assignment submission is involved.

## Controlled server entry point

Use only an already migrated, disposable local PostgreSQL database and a
dedicated test Redis database. The shared integration reset truncates fixture
tables. This script does not provision databases, migrate, publish or deploy.
Do not run it against production.

```bash
INTEGRATION_DATABASE_URL=postgresql://tester:password@127.0.0.1:5432/worker_439_test \
REDIS_URL=redis://127.0.0.1:6379/15 \
node scripts/qualify-worker-failure.mjs --dry-run

INTEGRATION_DATABASE_URL=postgresql://tester:password@127.0.0.1:5432/worker_439_test \
REDIS_URL=redis://127.0.0.1:6379/15 \
node scripts/qualify-worker-failure.mjs
```

Both URLs must be explicitly supplied; `.env` and `DATABASE_URL` are not
fallbacks. PostgreSQL accepts only numeric loopback (`127.0.0.1` or `[::1]`), a
simple lowercase name ending in `_test`, and no production/main/live name
segment. Redis accepts the same loopback hosts with an explicit positive
logical database. Both reject all URL queries and fragments, including `host`,
`port` and `dbname` overrides. Credentials and full URLs are never printed.
`--dry-run` parses these rules without opening a connection or writing a file.
The actual run additionally requires the exact formal 3.8.13 registry lock and
selects only this integration file through the normal integration runner.

The runner supplies synthetic provider/IM configuration and disables embeddings,
outbound email, alerts, external realtime and runtime object storage. It does
not register a production HTTP fault-injection route or invoke a production
diagnostic action.

## Validation status

The formal registry package is now installed and pinned to `3.8.13` in both
root/server manifests and locks. Its registry integrity is
`sha512-K2NFX9a6C/EIWp+wNM/zGbGCweTuQqk+UXQNA3LL/X5Cd93dnMXNYDheFLuq4gHXLkgkOoXp01YYlY2gcfTOIA==`;
the tarball ends in `4c4b353d0843064868ec6a0df0fdd57433f860fa`.
Installed public exports report runtime 3.8.13, schema 14, control-plane 11,
publicText 3 and runTrace 1. The native schema SHA-256 remains
`c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f`.

Completed owning checks:

- `npm run server:typecheck` passed. The first formal-package typecheck found
  two fixture inference errors; explicit diagnostic types fixed them before
  the passing run.
- `node scripts/qualify-worker-failure.mjs` passed against a fresh local
  pgvector/PostgreSQL 16 test database and dedicated Redis DB 15. Exactly one
  integration file/test ran, covering both controlled failure boundaries and
  platform/company-admin authorization. It made zero model calls, IM sends or
  assignment submissions. See [TAP](worker-failure.tap) and
  [runner receipt](worker-failure-timings.json).
- Focused server lint, CLI syntax and whitespace checks passed.

The updated candidate is based on current main after the release-controller
cutover. This PR no longer modifies any legacy host-release/runtime-patch
implementation or tests. Product deployment belongs to the designated release
controller publisher; this work performed no production operation.

This proves the restricted diagnostic chain, not the historical business root
cause. Earlier failures cannot be backfilled. After deployment, confirm the
actual service/runtime versions and inspect the next authorized failed run's
`workerFailure` through the platform resource-content or run-operations API.
Do not close #439 until the original learning conversation and assignment flow
have separately passed the required acceptance.
