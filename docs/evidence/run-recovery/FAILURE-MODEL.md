# Conversation recovery failure model

Baseline: `df30def96c0f464660af87067a7177d6730cc163` (main). No production conversation or run was read. The reported private production incident is not proven without its authorized run identifier.

Before implementation, test these failures:

- Recent-run discovery succeeds but anchored history fails (or the reverse): successful targets must survive; ordinary and already-read assistant text must remain available.
- An IM history row still says running but the durable run has succeeded, failed or cancelled: hydrate every terminal state; never recreate or resume it by reconnecting.
- SSE fetch hangs before headers or opens without an initial snapshot: bound the handshake and cancel the pending read; a timeout is a transport failure, not a failed run.
- EOF, network failure, stale replay or preview reset: observe the same run with capped exponential backoff; replace snapshots rather than append repeated text; preserve legitimate reset semantics.
- No authoritative response for the recovery window: release local running state, stop automatic requests, retain text, offer a plain reconnection action. Online/manual wake starts a new observation cycle.
- HTTP 401/403/404/410: stop retries, disable controls, distinguish session/access/missing state; do not infer successful completion or a new admission.
- Durable polling sees a terminal state while SSE is stalled: terminate the stream. A late stream or poll from a cancelled generation cannot replace a newer run/project/conversation.
- A genuine failed/cancelled run stays failed/cancelled; its established recovery UI remains available. No diagnostic connection card, status-check button, protocol text or raw server error reaches the conversation.
- Repeated reconnects never call send/ingest/revise/continue/reconcile/delivery retry. Existing stable outbox nonce and durable admission deduplication remain unchanged.

Owning checks: deterministic transport tests, the real assistant-stream decoder, real store reconciliation and rendered conversation; official `@e2e-dev/web` browser scenarios with synthetic HTTP only, plus web lint/typecheck/test/build. Record red/green logs and browser artifacts locally.
