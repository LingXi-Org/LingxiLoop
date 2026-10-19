# Optional presentation must not hold conversation results

Written before changing the implementation for issue #196. This covers product
projection only; a provider `model_unavailable` failure is investigated separately.
The initial red fixture evidence is retained in
`artifacts/memory-latency/presentation-initial-baseline.json`; the final identical
fixture comparison is `artifacts/memory-latency/presentation-paired.json`.

## Failure cases and boundaries

- A native `tool.completed` or terminal state has already been committed, but
  `assistantRunResponse` waits for optional tool display/timing SQL before it
  yields that authoritative event. Later native events wait behind that query.
- The same optional query is unconditional in `readRunProjection`, including
  ordinary replies with no tools. Initial SSE, snapshot recovery, and durable
  WuKong delivery all inherit this dependency; frontend recovery cannot bypass it.
- An unbounded pool wait or SQL lock wait must not become an unbounded display
  wait. Returning from a JavaScript timeout alone is insufficient: any acquired
  client and queued/active SQL must be cancelled or released within a short bound.
- A late presentation result must not mutate a cancelled, superseded or newer
  projection. A failed display lookup must not relabel a successful tool as
  failed, replace final prose, or invent timing.
- Healthy display titles, safe input fields, result summaries and measured tool
  timing must remain available in live and replayed messages.
- Run authorization, approval resolution, terminal feedback identity and
  questionnaire state are mandatory. Optional-display fallback must not suppress
  their errors or serve a cached snapshot after access is revoked.
- No memory body, prompt, credential or unrestricted tool input belongs in a
  performance artifact. Tests use fixed synthetic text and record durations,
  statuses, counts and runtime version only.

## Regression contract

`server/src/__integration__/presentation-latency.test.ts` uses the published
runtime, real isolated PostgreSQL/Redis and recording WuKong transport. It obtains
tool events and lifecycle states from a deterministic real worker. Only the
optional presentation table is locked, for 1.5 seconds, in the disposable test DB.

Required outcomes while that lock remains held:

1. A committed tool result and final state cross the assistant transport within
   250 ms, with their original result/status and final answer intact.
2. A no-tool snapshot remains readable within 250 ms. A newly completed no-tool
   run reaches recording WuKong within 600 ms of observing its native committed
   terminal state. Worker/context preparation is outside this delivery budget.
3. Optional reads leave no presentation query waiting on the lock after a
   further 150 ms; the test never cancels a required authorization query.
4. Healthy projection retains the actual tool summary and measured timing;
   another tenant/principal cannot read that metadata. Revoked HTTP access is
   denied without returning an answer. A cancelled run stays cancelled.

These are deterministic product transport budgets, not production/provider SLOs.
Normal provider time, network transit and worker queue time require separate
measurements. Tests must run in a dedicated test database, serialized with any
other fixture using that database. No production fault injection is permitted.

Additional regressions cover concurrent reads, active cancellation and healthy
stream enrichment. Optional reads use their own bounded connection capacity;
neither pool saturation nor a cancelled request may retain an active SQL client.
Initial fixture execution reproduced four approximately 1.5-second delays before
implementation. Final measurements and remaining limitations are recorded with
the paired baseline/candidate evidence.

Independent review added two failure cases before their corrections: real
state-before-event replay must retain valid display data while unrelated receipts
advance the view; a checked-out optional PostgreSQL client must absorb socket
errors without crashing the process. The local socket fixture verifies an actual
query disconnect rather than accepting a connection timeout as a passing result.
