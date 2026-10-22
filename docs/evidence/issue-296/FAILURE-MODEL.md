# Issue 296 failure model (before implementation)

- A live/reconnected stream shows only usage-ledger fallback because the viewer trace is not read at refresh, even though the public runtime trace has exact execution intervals.
- Legacy usage records have accurate individual durations but no epoch start/end. Do not reconstruct offsets from row creation, callback time, order, summed latency or current clock. A completed run duration requires its actual root interval.
- A duration-only record renders a fictitious 0–2ms axis or bars. It must remain a duration list without positioned bars; mixed traces position only the anchored intervals.
- Embeddings are presented as chat generations, or completion tokens absent from an embedding response invalidate its measured input usage.
- Known supplier costs are discarded because the projection only recognizes admission-price metadata; partial sums disappear or absent costs become zero. Match durable call identities when overlaying the ledger on a native trace; never double count calls or borrow another model's price.
- Native bridge failures reveal stale complete totals, lose already confirmed spans, weaken read authorization, delay answer frames, or leak raw call IDs, prompts and private input/output.
- New local/provider calls need actual wall-clock start/end capture before/after the provider invocation. Historical prices and model IDs stay unchanged; no production data/index mutation is authorized here.

Reproduction uses only the user-supplied redacted three-call sample (134/33730/3049ms, embedding plus two charged calls), synthetic scoped public snapshots and local deterministic provider boundaries.
