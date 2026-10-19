# Production review, 2026-10-19 UTC

Public production checks were healthy during this review. The review also
reproduced a conditional Worker startup cleanup defect in isolation; it does
not establish that production is currently experiencing that defect.

## Current observations and visibility

Repository main was `47ba60dc7f6fe23672dd4f28c08ef668ae48db7f`.
[Current HTTP observations](current-status.json) include timestamps and parsed
responses, with TLS verification enabled:

| Public route | Observed result |
| --- | --- |
| `https://loop.lingxilearn.cn/` | 200, LingxiLoop HTML |
| `/api/health` | 200, `ok: true` |
| `/readyz` | 200; database, Redis and control all true |
| `/api/health/dependencies` | 200; database, Redis and Open Notebook all true |
| `/api/meta` | Web `c132e9f20b3df1873792618ed3f3bfe8be2be00e`, LingxiOS 3.5.2, schema 12 |
| `https://ops.christmas1314.xyz/` | 200, Komodo HTML; DNS `49.232.41.248` (txy3) |

Unauthenticated `/api/livez` and `/api/readyz` returned 401 through the control
Worker's protected API routing. The public `/readyz` is the gateway's readiness
route; its successful response is recorded separately. The first generic web
fetch tool could not access either origin; subsequent real HTTPS requests
succeeded. Neither tool inaccessibility nor the expected 401 is an outage.

The cloud environment had no Sigillo/Komodo executable, Sigillo connector or
Komodo credential variables. No authenticated Komodo read was performed. Public
checks cannot establish the current health of all three nodes/eight stacks,
both Workers, actual running image digests, restart/OOM history, queue lag,
provider results, WuKongIM logs/WAL state, or database migration provenance.
The public schema value is package metadata, not a query of installed migrations.

Minimum remaining access: the existing authorized Sigillo
`LingxiLoop Control Plane` / `prod` operator identity injected into this cloud
environment for read-only Komodo API operations, including service/image
inventories, update history and bounded Worker/WuKongIM logs. If those views do
not expose migration provenance/queue or WAL evidence, an existing authorized
read-only diagnostic path is also needed. No new identity, key, permission or
security-setting change is requested. No local-machine credentials were used.

## Reproduced Worker defect and correction

Severity: P2, conditional failed-start recovery. In `startWorkerProcess`, real
channel reconciliation can create the passive local LingxiOS context, opening
its two realtime Redis sockets. If runner configuration, isolation preflight,
doctor or startup then rejects before returning a stop handle, that context
was not registered in the lifecycle. Product pool cleanup left the realtime
sockets alive. `runService` sets an exit code on startup rejection, so these
live sockets can keep the failed process alive and prevent exit-based restart.

The regression uses the actual published context, real isolated PostgreSQL and
Redis, a seeded conversation and successful channel reconciliation. WuKongIM is
the existing integration fixture; only runner startup is deliberately rejected.
Redis client inventory proves two preview sockets exist before rejection and
requires zero afterward, without changing or reading preview data. It also
checks original error identity, cleanup ordering and absence of later task
startup. The test was written and run before the fix.

[Before fix](worker-startup-red.log): **2 connections remained, expected 0**.
The patch registers `stopLingxiOSControl` after passive ownership is accepted,
before storage initialization/reconciliation. Reverse cleanup stops context
before Redis/PostgreSQL. The existing stop wrapper is idempotent when the runner
has already stopped the context. No dependency, schema, provider, authorization
or production deployment configuration changes are included.

[After fix](worker-startup-green.log): both the new failure regression and the
existing passive-startup regression pass (2/2). Lint and server typecheck pass.
The expanded server test run passed 113/114; its only failure was an existing
text assertion that rejected the independently pinned Worker `image` field
introduced by the already-approved production configuration. The assertion now
allows that optional field while still requiring full runtime-environment
inheritance. Its owning lifecycle suite then passed 8/8. This changes the test,
not deployment configuration. Full CI results are linked from the draft PR.

This is related to failed Worker startup cleanup, but is not evidence that
PR #180's active-context bug recurred. Passive role selection already exists on
main. Passive contexts do not open PostgreSQL notification listeners; that
initial diagnostic hypothesis was rejected before changing runtime code.

## Historical soak and WAL regression

The original soak was read at immutable commit
`ad92d1d78da79938e2d73f0fa85ce72f48a54dcf`. Its
[recomputed summary](soak-analysis.json) confirms 797 samples, 47,829.580655
seconds, last heartbeat `2026-10-17T19:59:57.427Z`, maximum gap 60.277 seconds,
zero recorded violations, zero waiting pool clients and zero acquisition
failures. Heartbeat SHA-256 is
`04b68d0fcf7b8d79483f993f50887901398218240459a767a099af2c94056cba`.
RSS ranged from 177.80 to 212.94 MiB. Heap samples are not post-GC retained-heap
measurements and do not prove a leak or its absence.

There is no terminal receipt and less than 24 hours of coverage. The historical
saved `running` field is stale. The recorded disappearance of processes and
later stopped container do not establish a cause or product failure. This
remains incomplete 3.5.1 isolated Web/API evidence, never 3.5.2 Worker/provider
acceptance. The old soak was neither resumed nor replaced.

The exact WuKongIM source composition in the current Dockerfile was tested in
an isolated checkout: base `c7f663fa23a4ee2c6f7e08c68423f50f0f6e9c47`, with
`pkg/controller/raft/raftstore` from
`0194a738d04836899b998de8b4ac392b3aadb979`. Go 1.25.0
`go test -count=1 ./pkg/controller/raft/raftstore` passed
([output](raftstore-test.log)), including retained-prefix recovery, restart,
corruption rejection and append safety. This does not inspect production WALs
or re-verify the historical seven SST hashes.

## Validation provenance and reproduction

The preinstalled cloud dependency was 3.3.8. Root `npm ci` for locked 3.5.2
returned registry 401 using the existing cloud GitHub identity. No credential
was created or copied. The integration regression instead ran inside the
existing published Worker image, pinned to downloaded manifest digest
`sha256:60d880d61735a7ba0185cd2b7f7d3b6573d5fa7fe8df3eee5a28761e6eb9af78`,
with current `server/` mounted read-only. That image reports 3.5.2/schema 12.
It is a downloaded release artifact, not a claim about the currently running
production Worker digest. Its configured source tag is `e1fe01c5d82d1553a9cc0f9d81d9e7d92898708d`.

Local lint/typecheck/server checks use the unchanged lock's public dependencies
installed in a temporary manifest and the unmodified published LingxiOS package
extracted from that image. Tracked manifests/locks were not changed. Normal CI
remains the canonical complete `npm ci` check with its existing package access.

With normal package access and Node 22, reproduce the affected integrations on
the repository's disposable services:

```sh
npm ci --ignore-scripts
node e2e/server/run.mjs --file worker-startup-failure.test.ts --file worker-startup.test.ts
npm run server:lint
npm run server:typecheck
CI_TEST_FILES='["server/src/__tests__/process-lifecycle.test.ts"]' npm run server:test
```

The local diagnostic run used the separate Compose project
`lingxi-prodreview-test`, synthetic credentials and disabled real providers.
Validation results and artifact hashes are recorded in `validation.json` and
`manifest.json`. No production writes, deployment, restart, migration, fault
injection, WAL change, issue closure or new 24-hour test was performed.
