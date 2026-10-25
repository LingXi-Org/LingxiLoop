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

The implementation is prepared for formally published LingxiOS 3.8.13. The
previously installed 3.8.12 package has no `runtimeFailure` API. The authoring
environment did not start or create PostgreSQL/Redis services and did not run
the integration test. The designated integrator must install the formal locked
release and run this single owning regression; retain its TAP output and the
integration runner's timing receipt before claiming qualification. Static CLI
validation is recorded separately and is not a passing runtime regression.

Authoring checks passed: `node --check scripts/qualify-worker-failure.mjs`,
in-process CLI target validation and `--dry-run` (including non-loopback,
non-test, URL-host-override and missing-explicit-environment rejection), the
integration file's TypeScript syntax transpilation and Biome lint, and whitespace
validation.
These checks opened no PostgreSQL or Redis connection and did not validate the
3.8.13 type contract or execute either controlled Worker failure.
