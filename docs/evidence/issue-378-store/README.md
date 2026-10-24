# #378 D/E: snapshot publication and canonical projection

This change addresses the transport/store derivation portion of #378. It does not complete dependency upgrades, Markdown rendering, component selectors, layout, or browser paint acceptance owned by other changes.

## Implementation and preserved boundaries

- Keep the installed `assistant-stream` decoder/delta tracker and its ordered immutable accumulator. Every incoming update still crosses native bounded/schema and run identity validation.
- Reuse a locally decoded snapshot's display projection through a private WeakMap. Arbitrary HTTP/history/lookalike objects still parse. Memory stripping, synthetic observed-progress filtering, and nested-message sanitization remain in the same display function.
- Retain at most one pending publication per subscription. Publish first useful text and all structural/control/terminal/replacement changes immediately. Text appends and monotonically advancing part watermarks coalesce to one visible frame (hidden tabs: 250 ms; visibility resume: immediate latest state). Close/error flushes validated text; abort discards pending state and callbacks. Durable poll, recovery and IM/history inputs flush earlier buffered SSE text outside the store updater. Recovery captures freshness after draining older text; each validated SSE arrival advances that freshness even before publication. Same-sequence control/receipt refreshes cannot be overwritten by earlier buffered state. Event accumulation and validation are never deferred.
- A canonical-array identity index allows only equivalent metadata/receipts/order plus text append to bypass history sorting/grouping. Unresolved quote dependencies use the full path. Non-changing parts retain references; changing projection watermarks retain their new values.
- Provider and page consumers share the same weakly held message derivation. Participant/branch changes invalidate it. Each history retains at most 32 thread projections.

There are no new provider calls, prompt changes, protocol fields, permissions, migrations, or runtime package changes.

## Local CPU comparison

Baseline: `47b92860279b8b5111932b8e528383f25fed67ce`. Same Node v24.19.0, installed dependency tree, synthetic v3 public-text stream, 400 chunks / 2,800 final characters, two snapshot consumers. Fixture generation is outside the timer. Baseline and candidate were measured sequentially once on the shared cloud CPU. This is a workload comparison, not a statistical or browser/production latency claim.

| Loaded history | Delivery pattern | Baseline CPU | Candidate CPU | Publications before → after |
| --- | --- | --- | --- | --- |
| 100 | Every update publishes | 245.95 ms | 257.56 ms | 400 → 400 |
| 500 | Every update publishes | 552.52 ms | 230.06 ms | 400 → 400 |
| 100 | Eight chunks per simulated frame | 233.46 ms | 71.98 ms | 400 → 51 |
| 500 | Eight chunks per simulated frame | 528.36 ms | 87.51 ms | 400 → 51 |

Both retain every history message reference and exactly 2,800 final characters. The smaller unbatched workload did not improve in this sample; batching is the principal high-frequency improvement. Separate text/unchanged-tool tests verify part identity preservation. No FPS, paint, React commit, low-end-device, or real-provider improvement is claimed here.

Reproduce from the desired checkout: `node --import tsx /absolute/path/to/benchmark.mts`. The script detects whether the candidate publication/projector code exists, enabling the same fixture on the baseline. The simulated-frame mode calls the production publisher with an injected deterministic clock; no browser scheduler or model is emulated as a measured production fact.

## Regression coverage

Existing native message, converter, store, run-update and transport tests remain. New cases cover first body, 1,000 chunk bounded publication, v2/v3 server projections, final tails, failure/cancellation/fence/control changes, same-length replacement, hidden/visible resume, stale callbacks, same-sequence durable control refresh, reconnect/reload/older-page recovery overtaken by pending SSE, decoded/untrusted validation boundaries, nested privacy stripping, cumulative length limits, unresolved quotes, participant/branch invalidation and unchanged row/part identity.

Browser/build and exact-head CI results are recorded in the PR after execution. #378 remains open for the other workstreams and integrated browser acceptance.
