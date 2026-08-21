# Runtime-native event stream

LingxiGraph is the canonical owner of managed-agent run lifecycle, steering,
ordering, idempotency, safe-point consumption, recovery, and run events.
LingxiLoop owns the durable chat message and decides which trusted active run
belongs to the target agent; it does not maintain a second steering queue for
the `lingxigraph` reasoning path.

```text
Loop message store
  -> trusted agent -> active Runtime run mapping
  -> POST /v1/runs/{run_id}/steer (Idempotency-Key = message.id)
  -> LingxiGraph durable steering inbox
  -> graph runtime.drain_steering() safe point
  -> run.steer.consumed
  -> Loop advances the conversation read cursor
```

`202 Accepted` is not treated as consumption. Loop keeps the original message
unread until the durable `run.steer.consumed` event arrives. A
`run.steer.superseded`, `run_finalizing`, or `run_terminal` outcome falls back
to a normal new turn. This prevents both silent loss and steer-plus-new-turn
double processing.

The user-visible output channel is the Runtime's durable SSE endpoint:
`GET /v1/runs/{run_id}/stream`. Provider deltas are emitted by the graph as
named `message.delta` custom events; steering acceptance/consumption and node
lifecycle share the same ordered stream. Clients resume with `Last-Event-ID`
and deduplicate by `(run_id, sequence)`.

The local `server/src/agents/steer.ts` queue remains only for the explicitly
selected `legacy` runtime and must not be imported as the source of truth by
the LingxiGraph path.
