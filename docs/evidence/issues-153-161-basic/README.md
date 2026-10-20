# #153 / #161 basic acceptance, 2026-10-20

The user's current scope is completed basic capability plus short isolated
acceptance. A 24-hour soak is no longer a closure gate. This evidence does **not**
claim a soak, live-provider/billing, complete SPA or production sandbox pass.
The fixed 3.5.3 soak and paused automation were not accessed or changed.

Reviewed source baseline: `e7422872a8314823794875c81b14f9393a08e15f`, fetched from
main before work and rechecked after execution; application image source remains
`7bdb7db9a7fb52ad304ea7d653742abc77e0e7e5`. Both manifests/locks pin the published
`@lyyzka/lingxios@3.5.5`; a fresh root `npm ci` installed that exact package.
The environment's original checkout had stale 3.5.2 modules; they were not used.
A fresh disposable database applied product migrations 1–46 and runtime schema12.
No production verification or deployment is claimed by this task.

Read both full issues/comments and merged PRs #168/#170/#174/#175/#180/#185/#194,
plus the later #198/#206 runtime/resource changes. Historical versioned evidence
remains historical. This task's source review found no additional defect. The
integrator separately confirmed that product delivery/model-usage callback SQL
can outlive the runtime callback deadline and occupy foreground pool slots;
that defect remains an open #153 dependency tracked by PR209. These short tests
do not cover or clear it. This PR adds **current-version short process evidence**,
with the prior-written [failure model](FAILURE-MODEL.md), not a runtime change.

## #153: roles, resources, pool and readiness

- `server/src/bin/web.ts` and `bin/worker.ts` keep process ownership separate.
  `agent-runtime/runtime.ts:190` selects passive ownership before local context;
  the Worker cannot own the API control listener. `worker.ts:64` registers
  context cleanup before reconciliation and runner admission. Startup regressions
  use real PG/Redis, check passive ownership and zero leaked preview connections.
- The public 3.5.5 background configuration used by `runtime.ts:102` defaults to
  2 database connections per active process, exponential empty/error polling
  from 1s to 30s and 60s sweeps. Passive context starts no maintenance or LISTEN.
  The background limit is a subset of the main pool, not an extra pool. Actual
  code is in the published package `app/background-scheduler.js` / `app/index.js`.
- Compose A/B retain Web 0.75 CPU / 640 MiB / 320 MiB old-space, Worker
  1 CPU / 1 GiB / 640 MiB old-space, Worker concurrency2 and one interactive
  reservation. No tuning or production resource change was made.
- `db/pool.ts` bounds the main pool at the Compose default8, acquire5s,
  SQL60s and idle-transaction30s. The optional presentation pool is separate,
  max2, acquire/query75ms, and both pools close at lifecycle shutdown. With
  two Web and two Worker processes, the configured application upper bound is
  **4 × (8 + 2) = 40**, including main-pool LISTEN slots. Background slots are
  not double-counted. Migration/operations/other-service headroom must be
  accounted separately; this is repository configuration, not a live capacity
  measurement or proof of production max_connections.
- `modules/platform/application.ts:115` / `health.ts` separate liveness from
  required PG/Redis/control readiness and coalesce actual pending IO across
  probe deadlines. Optional Notebook is diagnostic. Compose's 4s request
  timeout fits its 5s probe; gateway safe GET failover retains the existing
  non-idempotent POST boundary.
- Foundation checks passed **7/7** on Node22.23.3: malformed/unready/stalled
  control, required/optional independence, 24 simultaneous probes, Redis
  disconnect/recovery, real PG saturation/recovery, Promise/callback metrics,
  and three 3-second sampler stages. 29 normal + 4405 burst fixture GETs had
  zero errors. These are plumbing samples, not dialogue throughput or SLOs.
  See [foundation receipt](foundation/regression.json), [log](foundation.log),
  and [Compose checks](foundation/config.json).

**Foundation evidence: satisfied**, subject to the integrator's review. Overall
#153 acceptance remains pending the independently found callback deadline fix,
its owning tests and production deployment. These fixture changes alone need
no deployment. Long memory/heap trends, production load and full fault/SPA matrices
remain unverified and are not silently relabelled as passing.

## #161: durable terminal, replay and next-message recovery

`agent-runtime/delivery.ts:29` checks binding, frozen audience and request
version before delivery, keeps stable `terminal-${feedback.id}` identity,
reuses a validated persisted payload, sends a system notice with
`suppressAgentWake`, and never manufactures a successful result. The public
runtime owns terminal persistence/outbox, lease fencing and bounded retries;
product SQL never changes these states in the new process test.

[Process fixture](../../../server/src/__integration__/basic-process-recovery.test.ts)
uses three actual child Worker processes connected to product control over HTTP:

1. Native `chat.send` writes once through product authorization and action/send
   ledgers. The final result commits, then the proxy loses its acknowledgement.
   The original child is killed with SIGKILL and its exit is checked.
2. A replacement starts while its control connection returns503. Its readiness
   is503, it invokes no model, and the next request remains queued. Restoration
   produces readiness200 and successful next-message delivery. The original
   result ID and original model ledger do not change; the native write stays1.
3. Terminal IM acceptance succeeds but its acknowledgement is lost. The control
   service is stopped/recreated against the same database. Feedback identity
   and cancelled status survive with no fabricated result. History reconciliation
   acknowledges the same one system message; a further human request succeeds.
   Final product work counts: **3 succeeded, 1 cancelled, 0 queued/leased/waiting**.

The control **service instance** is recreated in the test process; the three
Workers are distinct OS processes. This does not claim a whole Web process or
machine restart. IM is a recording HTTP fixture, model output is deterministic;
all product authorization, persistence, action ledger and delivery paths run.
Existing owning coverage additionally checks failed/cancelled notices, no replay
send, revoked-project denial with stopped retries, bounded total timeout and
settlement, tool correction, message history reconciliation, and Worker cleanup.

**Basic-acceptance recommendation: satisfied**, subject to integrator review.
Do not present this as the original exhaustive matrix: pre-result-commit crash,
lease-expiry/stale-owner injection, real WuKong, full SPA, live provider and bills
were not newly qualified. Earlier relevant browser evidence remains versioned
3.5.1/3.5.2; the new evidence does not upgrade it to3.5.5.

## Commands and truthful run history

From this isolated worktree, after a frozen install (Electron download skipped
as in CI), use Node22.23.3 on PATH. `isolated-env.mjs` strips inherited application
configuration and injects only synthetic local fixture values. The standard
integration runner additionally refuses non-test database names.

```sh
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --cache /tmp/lingxi-basic-npm --prefer-offline --no-audit --no-fund
docker compose -p lingxiloop-basic-153-161 -f e2e/server/compose.yaml up -d --wait
node docs/evidence/issues-153-161-basic/isolated-env.mjs --import tsx server/src/migrate-bin.ts
node docs/evidence/issues-153-161-basic/isolated-env.mjs server/run-integration-tests.mjs \
  --file basic-process-recovery.test.ts --file worker-startup.test.ts \
  --file worker-startup-failure.test.ts --file runtime-reliability.test.ts \
  --file runtime-deadline-recovery.test.ts --file runtime-tool-recovery.test.ts \
  --file im-conversation-style.test.ts --file platform-lifecycle.test.ts
node scripts/issue-153/run.mjs --foundation-only
node scripts/issue-153/config-check.mjs
npm run server:typecheck
npm run server:lint
```

The foundation runner's explicit `--foundation-only` retains its historical
3.4.7 gate and records `frozenDependencies:false`; it imports no LingxiOS.
It is **not** represented as a frozen product/runtime qualification. Exact3.5.5
is separately covered by the process and owning integrations. Sampler files
were copied here, and historical tracked foundation evidence was restored.

Logs preserve test outcomes with trailing whitespace normalized.
First fixture attempts are retained: [initial request mismatch](fixture-initial.log)
and [combined run with terminal unknown outcome](owning-initial.log).
The first incorrectly required a fresh native write while the follow-up model
only returned text; the product correctly returned partial. The second threw
before a send, leaving an intentionally uncertain acceptance with no historical
receipt. Product behavior correctly refused to infer non-execution and blindly
resend. The final fixture loses the ACK **after actual recording acceptance**,
so reconciliation has authoritative evidence. Neither is a product bug fix.
The Node24 pass is retained separately in [process-node24.log](process-node24.log).
Final Node22 results and checksums are in `validation.json`, `owning-node22.log`,
`runtime/process-recovery.json` and `SHA256SUMS`.

Node22's first combined run was **12 passed / 1 failed / 0 skipped**. The new
process test passed; the unchanged #155-overlapping
`runtime-deadline-recovery.test.ts:60` first observed zero HTTP requests under
its100ms deadline, and an isolated recheck failed its whole-run `<3000ms` bound.
A temporary diagnostic copy changed only logging, preserved every assertion,
and passed with1 request,1 disconnect and510.38ms. Its log is retained; the
copy was removed and the shared original file was not modified. This shows a
timing-sensitive existing test, **not** a proven root cause or a clean combined
run. The integrator should coordinate this with #155 before claiming that
check is consistently green. The final unchanged deadline + corrected process
selection then passed **2/2, zero failures/skips**, in20.33s total; see
[final affected log](final-affected-node22.log). The original Node22 combined run
remains recorded as12/13. Main driver turns (2 for the original Worker)
are distinct from budget-ledger calls (3, including verification).

Only the sole integrator may merge, deploy or close these issues. No issue state,
credential, security setting, production data or #155/#157-owned file was changed.
