# Learning-agent coordination

LingxiLoop uses deterministic wake routing; there is no model-based triage.

- A direct message wakes its agent.
- `@Agent` wakes the named agent; `@everyone` wakes all six learning agents.
- A reply to an agent wakes that agent.
- An unmentioned human group message wakes the room leader: Nova in Study Room
  and Forge in Lab.
- Agent-authored messages do not fan out unless they contain an explicit
  mention or typed handoff.

WuKongIM assigns message order. A post-commit webhook is validated, deduplicated
and converted to an `AgentWorkItem` in the same PostgreSQL transaction as its
receipt. An unprocessed receipt is retryable. The durable queue grants a lease
with a monotonic fencing token plus a session lease, so only one work item can
mutate a session at a time. Each worker also enforces
`AGENT_OS_MAX_CONCURRENT_RUNS` (default 8) to bound model and kernel pressure.

Agent OS owns the model loop and history. It streams visible deltas and
activity, posts exactly one durable final message, and checkpoints the session
under `{companyId, agentId, channelId, threadRootClientMsgNo?}`. Stop aborts the
current model request and IPython cell. Steer is queued as the next
highest-priority input; already completed side effects are not rolled back.
The persistent IPython kernel uses the same session identity, so Python values
never leak between an Agent's channels or threads. Session checkpoints use an
optimistic revision check as a final stale-writer guard.

Handoffs are explicit user-visible events. Approval-required Host Bridge
actions are persisted by `{runId, cellId, callIndex}`. `runId` is the durable
work id, cell ids are deterministic, and sink operations receive the same
idempotency key on crash recovery. Approval resumes only
that action and injects its synthetic result into the loop; the original cell
is never replayed.
