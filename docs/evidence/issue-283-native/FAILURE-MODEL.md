# Public native trace bridge failure model (before implementation)

- Native snapshot, live stream and history must use current product/root/child authorization; no private runtime tables or guessed child identity.
- A slow/failed optional trace must not delay the next answer or reuse cached totals. A null snapshot removes native descendants/metrics; root request/fence change invalidates old trace.
- Replayed stable spans replace rather than append. Explicit native parent links form the tree; missing/cyclic/out-of-bound nodes mark coverage incomplete, never invent a parent or aggregate.
- Native execution origin is distinct from creation time; legacy null start/end and unknown usage/cost remain null. LLM interval includes admission, not provider-only latency.
- Public tool display can enrich only an exactly matching root tool call. Raw args/results, private model.request and hidden reasoning never enter metadata or body.
- New trace events remain metadata, with current answer/commentary routing unchanged. No activity aggregate buttons are restored.

Minimal verification uses the real public native control/Worker persistence and SSE fixture, safe DTO replay/identity tests, and affected TypeScript/lint. No production private data or external providers are needed. Formal 3.8 pin/profile migration belong to the release owner; local package overlay is explicitly not a published dependency.
