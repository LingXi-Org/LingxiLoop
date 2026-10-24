# #378 D/E failure model (before implementation)

Baseline: 47b92860279b8b5111932b8e528383f25fed67ce (PR386 merge).

Each Assistant Transport delta is accumulated and fully bounded/schema/identity validated. Currently the parsed clone is discarded; applyRunSnapshot parses the same snapshot again. Every text update then rebuilds the canonical map, anchors, sort, and message groups across the loaded history. Multiple snapshot consumers independently enrich/project the same history.

Expected repair: retain external validation per event; use an internal validated snapshot/display pair, one pending text publication per subscription, and an append-only canonical fast path that cannot alter identity, receipt, grouping, permissions, state, or replacement semantics. All non-text transitions publish immediately. First body text publishes immediately. Abort disposes pending callbacks; close/error flushes the last validated text only. Fresh HTTP/history input remains fully parsed.

Regressions to prevent: delayed terminal/approval/fence or control changes; stale callback after cancellation; lost final text; same-length replace mistaken for append; lost canonical receipt/quote/anchor; private memory or observed-progress leakage; crossing run/request/fence; reference churn in unchanged history/parts. Existing lifecycle, recovery, quote, and receipt tests remain authoritative.

Measurement: local deterministic CPU workloads with 100 and 500 history messages, 400 append chunks; same fixture/process settings before/after. Report CPU and object-reference churn only, not browser paint/FPS or production latency. No provider/production calls. Browser/build uses the parent-assigned serial slot later.
