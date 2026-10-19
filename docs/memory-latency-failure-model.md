# Issue 196 measurement and failure model

Before implementation, the following are hypotheses to test, not attributed causes:

- `memory.list` can spend time in admission, current authorization, pool acquisition,
  query execution, receipt/event persistence or delivery. A subsequent model call
  can take time after the read has already completed.
- A read can be coupled to unrelated evolution-benchmark registration or optional
  presentation queries; pool saturation or lock waits can amplify that coupling.
- A list can fetch bodies that the public result discards. Data volume must be
  measured with equal fixtures before choosing an optimization.
- Cancellation/deadlines can release the visible wait while leaving orphan queries,
  lose a terminal event, or prevent the next message from running.
- Reconnect can replay a start without its completion, or mislabel a failed read
  as successful. A missing memory must never become invented remembered content.
- Any cache or batching can return revoked, deleted, expired, cross-user,
  cross-project or stale-version memory. Current authorization must remain intact.

The baseline uses the published 3.5.3 public API, an isolated PostgreSQL/Redis
project, synthetic memory and a deterministic model. It records only durations,
counts, fixed query categories and outcomes, never SQL parameters or memory text.
Cold means the first operation in a fresh process/pool, not a flushed OS/DB cache.
Provider, browser delivery and production observations are reported separately.
No production fault injection is permitted.
