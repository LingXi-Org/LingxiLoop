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
and converted to an `AgentWorkItem`. The durable queue grants a lease with a
monotonic fencing token, so duplicate webhooks or workers cannot commit a
second outcome.

Agent OS owns the model loop and history. It streams visible deltas and
activity, posts exactly one durable final message, and checkpoints the session
under `{companyId, agentId, channelId, threadRootClientMsgNo?}`. Stop aborts the
current model request and IPython cell. Steer is queued as the next
highest-priority input; already completed side effects are not rolled back.

Handoffs are explicit user-visible events. Approval-required Host Bridge
actions are persisted by `{runId, cellId, callIndex}`. Approval resumes only
that action and injects its synthetic result into the loop; the original cell
is never replayed.
