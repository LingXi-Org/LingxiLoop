# Agent OS event stream

Every run emits ordered `AgentRunEvent` records with a per-run `seq`. The
control plane persists events and mirrors user-visible activity to WuKongIM:

- `run.started`, `run.completed`, `run.failed`, `run.cancelled`
- `model.started`, `model.delta`, `model.completed`
- IPython execution and artifact events
- `approval.pending` and resolution events
- handoff and final-message events

Raw Python is folded and redacted by default. Internal events remain in the
run ledger and are not published to learners. Model deltas are ephemeral
previews; the durable final response is a normal `LingxiMessageV1` message and
always wins over previews.

The browser consumes committed messages and stream events from WuKongIM. A
committed message immediately reconciles the matching optimistic row and clears
the same run's ephemeral preview; a missed terminal stream event therefore
cannot leave a duplicate reply. History and older-page recovery use WuKongIM's
sequence cursor (`beforeSeq`) through the authenticated IM adapter. They never
fall back to a PostgreSQL message table or a second browser transport.

Stop and Steer use control-plane APIs and the durable run lease. A worker
heartbeat observes cancellation or queued steering without relying on a chat
WebSocket. WuKongIM remains the authority for chat, ordering, read state and
offline synchronization.
