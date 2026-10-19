# Issue 196: bounded optional presentation reads

The useful boundary is a native tool completion or terminal answer becoming
visible, followed by durable WuKong delivery. The UI already converges when it
receives those authoritative frames; hiding its loading indicator would not fix
delivery. `syncPresentation` previously awaited optional display/timing SQL on
every state/tool frame and unconditionally during snapshot/delivery projection.

This is a reproduced product projection dependency, not evidence that production
model latency or PostgreSQL caused every reported delay. Provider failures are
handled separately by issue 197. No production fault injection was performed.

## Change and limits

- Native events and mandatory approval/terminal/questionnaire lookups retain
  their order. A single coalesced presentation refresh enriches the stream
  independently, without delaying later native frames. Healthy summaries and
  measured timing survive both event-before-state and real state-before-event
  replay. A no-tool projection issues no presentation SQL.
- Optional reads use one process-scoped pool with at most **2** extra connections,
  **75 ms** acquisition and server statement timeouts, **100 ms** total read budget,
  and **10 s** idle eviction. Pool acquisition timeouts remove queued waiters.
  Abort/deadline destroys an active client and its socket; this is not a timeout
  race leaving SQL running. A caller aborted during acquisition is cleaned up by
  its bounded acquisition timeout. Shutdown closes both pools.
- Enrichment applies only to the same request version, fence, lifecycle and tool
  event revision. It changes display/timing fields only. Native text, outcomes,
  approval state and cancellation remain authoritative. Prefetch errors are
  retained under downstream backpressure and propagated when consumed.
- Tenant/principal/run/session joins remain intact. Required authorization,
  approval, terminal and questionnaire errors never enter optional fallback.
  Unavailable metadata retains the existing generic tool display; it does not
  invent timing or alter the tool result. No new credentials or log payloads.

Initial HTTP snapshot reads with tools may still spend up to the short optional
read budget. SSE disconnect aborts both optional SQL and the native reader. The
ordinary snapshot route retains that bounded budget on disconnect. Event-loop
stalling can delay JavaScript timers; the server statement timeout independently
bounds SQL. Deployment capacity must allow up to two additional database
connections per API/worker process; no migration or runtime change is required.

## Evidence and budgets

All measurements use published runtime **3.5.3**, Node 22, the same disposable
PostgreSQL database and Redis DB 15, a deterministic real worker, and recording
WuKong. The fixture holds only the optional presentation table for **1,500 ms**.
It observes actual streamed snapshots, native committed state and IM receipts.
No memory body, provider input or credential is recorded.

The initial implementation failed seven of ten cases; healthy presentation and
revoked authorization passed. The final fixture adds real replay ordering, so
the baseline is expected to pass four of eleven and fail the seven old defects.
The completed comparison alternates baseline A / candidate B ten times, with
identical fixtures and runtime versions. Raw durations, fixture hash, source diff
hash, counts and p50/p75/p95 are in
[`presentation-paired.json`](../../artifacts/memory-latency/presentation-paired.json).
Initial red evidence is retained separately; it measures whole worker-to-delivery
time and is not substituted for the final committed-terminal-to-delivery metric.
Its cancellation case measured wrapper settlement while upstream remained open
and failed its cancellation assertion; the paired fixture waits for actual
upstream cancellation instead.

| Boundary | Baseline p75 (ms) | Candidate p75 (ms) |
| --- | ---: | ---: |
| Tool completion visible | 1506.05 | 8.82 |
| Terminal visible | 1515.40 | 20.08 |
| No-tool snapshot | 1506.16 | 17.02 |
| IM after native terminal | 1199.03 | 102.19 |
| 12 concurrent tool snapshots | 1516.07 | 210.73 |
| Cancel active optional read | 1501.92 | 31.13 |

Regression budgets: tool completion/final transport under 250 ms; no-tool
snapshot under 250 ms; IM within 600 ms of native committed terminal observation;
12 concurrent tool snapshots under 400 ms; active cancellation under 150 ms.
After a further 150 ms the database must show no presentation SQL waiting on the
held lock. These are isolated product budgets, not production/provider SLOs.

## Reproduce

Use local services from `e2e/server/compose.yaml`. The runner creates and truncates
only `lingxiloop_presentation_test` on local port 55432 and uses local Redis port
56379, DB 15. Reserve these fixtures; do not run another test against them.

1. Create a detached baseline worktree at
   `088e269f36f63884b44704c3b0f1e27f1a6f76fc` and install its exact dependencies.
2. Copy the candidate's `server/src/__integration__/presentation-latency.test.ts`
   into that worktree without changing its product source. Install the candidate
   dependencies with the same published runtime version.
3. In the candidate, run
   `node perf/presentation/run-pairs.mjs /path/to/baseline-worktree 10`.

The script rejects mismatched fixtures/runtime versions and unexpected test
outcomes. It uses only synthetic local credentials and blocks live model calls.
Detailed per-run logs remain local artifacts; the aggregate contains durations
and test counts only.

## Validation and integration

- Presentation integration: 11/11. Existing public activity, approval, questionnaire
  and native collaboration integration: 15/15. Server unit tests including socket
  disconnect and backpressure regression: 103/103. Server typecheck and lint pass.
- Independent review reproduced and then verified corrections for lost metadata
  after real replay ordering and uncaught checked-out client socket errors. It
  also verified cancellation, revision/fence/tool changes reject old metadata,
  while unrelated previews preserve valid metadata.
- No live-provider or browser performance claim is made. No production operation,
  deployment, migration, upstream runtime change or long soak was performed.
  The parent integrator must rerun owning checks after integrating with its exact
  published runtime 3.5.4 candidate, then serialize release verification.
- Recovery is an ordinary code rollback to the preceding validated build. There
  is no data/schema transition to undo. Verify version/health and durable receipt
  under the normal release workflow; leave the paused 3.5.3 soak untouched.
