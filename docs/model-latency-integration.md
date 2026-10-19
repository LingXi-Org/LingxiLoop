# Model availability and memory-wait diagnosis (196 / 197)

The "view memory" activity label is not a measurement of database time. A turn
can finish `memory.list`, then wait for the next model response or a structured
auxiliary call before its final response is delivered. Diagnose those stages
separately; neither the model nor the database is a root cause by assumption.

`src/lib/runActivity.ts` maps `memory.list` to that label. The public runtime
memory service resolves current scopes through `runtime.ts` and
`resolveMemoryScopes`, executes its native memory query, and commits native
`tool.started` / `tool.completed` events. `assistant-transport.ts` projects
those events into the browser stream and recovered snapshots; `delivery.ts`
uses that projection for durable IM delivery. `src/lib/memoryActivity.ts`
exposes only authorized public summaries as memory chips. The projection's
optional display lookup and the subsequent model call are separate waits.

## Measured reproduction

All committed fixtures use an isolated database, deterministic HTTP responses
and synthetic content. They record timings, counts, enum outcomes and versions,
never memory text, credentials or provider error bodies.

- Published runtime 3.5.3: 0/8/1024-document memory-list warm medians were
  15.31/12.42/12.94 ms. On the latest migration-46 main, the repeat was
  11.96/13.68/14.42 ms. Native tool start-to-completion was 42–84 ms in the
  initial fixture. These small samples are not production percentiles.
- Holding an unrelated benchmark-registration lock for 1200 ms made the list
  take 1204.32 ms (1188.24 ms registration, 0.75 ms memory SQL). Holding the
  optional presentation table made completed-event projection take 1208.68 ms.
  These demonstrate conditional coupling, not an observed production lock.
- A local HTTP auxiliary response completes at 250 ms inside a 1500 ms request
  budget. With a 100 ms first-byte budget, the old nonstreaming structured path
  fails all three attempts and leaves the turn partial. The baseline is
  `artifacts/model-availability/auxiliary-baseline.json`.
- The upstream comparison uses the same 120 ms response and 500 ms request
  budget: default structured/compaction time out at 65.56/60.74 ms, while opt-in
  streaming succeeds at 158.44/124.66 ms. These are single fixture samples;
  success under the same deadline is the result, not a speedup percentage.

Regression targets are memory list and completed-event projection below 250 ms
under an unrelated held lock, and cancellation/terminal visibility below 1 s
once authoritative state exists. The known optional coupling is deferred from
this urgent model-availability repair. No target is represented as achieved
unless its corresponding test passed.

## Candidate behavior

[LingxiOS PR 30](https://github.com/LingXi-Org/LingxiOS/pull/30) adds public
`reasoningEffort: 'low'`, independent `compactionReasoningEffort` and opt-in
`auxiliaryStreaming`. Only GLM-5.3-Flash on `api.siliconflow.cn` receives those
options in the product. Other provider/model defaults, `maxThinkingTokens: 0`,
request/first-byte/idle budgets and recovery limits remain unchanged.

Streaming allows auxiliary progress to satisfy the first-byte/idle budgets
without exposing reasoning as user text. Structured responses still require
complete valid JSON and a successful finish reason. Truncation, idle, total
timeouts and cancellation retain their bounded failure behavior. Current
memory authorization, revocation, deletion and ledger checks remain intact.

The product uses only the exact formally published package and public exports;
no source import, tarball, vendor copy or compatibility adapter is permitted.
The candidate integration exercises a real HTTP provider fixture, completed
tool receipt, auxiliary retry, measured usage settlement, durable delivery and
a following human turn. Its artifact records the actual installed runtime.

## Release and limitations

The upstream merge is `b0d42467dfcb39f3069af658ef2547a8d1e5692b`. Its exact-main
[release gates](https://github.com/LingXi-Org/LingxiOS/actions/runs/39283815402)
and [3.5.4 publication](https://github.com/LingXi-Org/LingxiOS/actions/runs/39286720432)
succeeded. Both product locks contain that registry package and integrity; its
`gitHead` matches the reviewed merge. See
`artifacts/model-availability/runtime-package.json`. The two auxiliary scenarios
and 14 owning integration cases passed with that installed package, including
26 synthetic conversation turns, repeated compaction, provider failure recovery,
authorization, revocation and deletion. The candidate artifacts distinguish
measured usage from the one injected 503's estimated settlement.

There is no new migration: product migration 46, runtime schema 12 and protocol
11 remain compatible. The ordered rollout must still run the existing explicit
`db:migrate` step: it refreshes the installed runtime-version/hash receipt to
3.5.4 even when no numbered SQL migration is pending. The local first candidate
run correctly rejected the old 3.5.3 receipt before any test ran; running that
explicit installation on the disposable test database resolves the mismatch.
A rollback must use the same ordered procedure with a matching package receipt,
not merely restart a 3.5.3 image against the 3.5.4 receipt.
The production postflight reads version expectations from
the installed public package instead of hardcoding the preceding release.
Verify immutable A/B images, both Worker healthchecks, Web readiness and the
Komodo update's final `Complete` / `success: true` receipt before declaring
rollout complete. Leave the fixed 3.5.3 isolation observation untouched.

Explicit low effort is a provider parameter, not a latency SLO. Streaming
cannot make a silent provider send progress. Synthetic tests and cloud probes
are not equivalent to the production credential/network path. Health checks do
not establish model business availability. Caller cancellation can still
conservatively settle an in-flight call at reserved usage through the existing
runtime cancellation boundary; exact measured recovery is not claimed there.
