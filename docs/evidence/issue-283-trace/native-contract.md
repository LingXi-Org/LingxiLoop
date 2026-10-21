# Minimal native trace contract requested for LingxiOS PR39 / Loop PR282 coordination

Product task #283; native dependency tracked explicitly in https://github.com/LingXi-Org/LingxiOS/issues/40 . PR39 is already merged for purpose; this trace contract is a separate coordinated follow-up. Do not modify purpose parsing, provider framing or response acceptance here.

## New native public event projection (proposed)

A replayable `trace.span.started` / `trace.span.ended` (or equivalent typed read API) with:

- version: 1; runId; monotonic durable seq
- requestVersion, fence, attemptId (immutable, same execution identity as public text)
- spanId (stable across replay), parentSpanId (null for root)
- kind: agent | llm | tool; state: running | waiting | complete | cancelled | failed | unknown
- startedAt: UTC epoch milliseconds captured at actual execution start; completedAt at actual settlement. Or startMs/endMs relative to a persisted run origin, explicitly documented.
- LLM: callId matching ModelCallObservation; model; usageAvailable; inputTokens/outputTokens; optional actual-priced cost snapshot and measurement classification. No missing-price zero.
- Tool: stable existing toolCallId; no raw arguments/results. Product owns allowlisted I/O display.
- Child agent: explicit parentSpanId plus childRunId; discovery/read must apply tenant/principal/session/channel policy, never infer ownership from arbitrary payloads.

Expose only metadata above through public exports / user-safe projections. Native internal `model.request.*` includes prompts and cannot be forwarded wholesale. Product must never read private native database tables. Avoid parsing callId strings to infer tree lineage.

Persist lifecycle timestamps before execution begins and on settlement/cancellation, not on subscriber arrival or observer callback. Fence stale writes; deduplicate replay by spanId/revision. Final cancellation must close in-flight children at their observed/cancelled times and preserve unconfirmed outcomes as unknown. A snapshot read must include spans which started before SSE subscription; ended events/read results must preserve timestamps. Authorization must be applied identically for live and restored runs.

Current product bridge: RunStreamProjection metadata.custom.runTrace, buildRunTrace(), scoped shared llm_calls read, existing agent_public_tool_activity timestamps. Missing old LLM offsets and terminal timestamps remain null. No runtime dependency changes/publication/production actions are authorized in this task.

## Integration seam

Prefer a public `readRunTrace(identity)` plus typed user-safe SSE events or a typed `RunState.trace` snapshot. Product replaces nullable LLM offsets/terminal time from that API, uses explicit authorized child spans, and continues using existing public tool display for I/O. Keep native raw/private event data out of browser custom metadata. Root clock uses native origin; queued time should be identified separately if creation differs from execution start.
