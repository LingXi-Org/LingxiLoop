# Integrated CI and streaming optimizations

This candidate combines PR203 and PR204 after the runtime 3.5.4 and bounded
presentation repair. Original source commits remain in history. The sole source
conflict was the streaming scheduler: the resolved implementation keeps native
and optional-presentation events independent, preserves cancellation/error
propagation and mandatory authorization/approval/terminal/questionnaire reads,
and applies the validated single-snapshot/structural-diff optimization.

Both root and production dependency locks install successfully with existing
registry access. Runtime3.5.4 remains exact in both. Removed package payloads are
57,507,868 root bytes and 1,304,045 production-dependency bytes; these are package
contents, not measured whole-image or browser-bundle savings. Surviving package
identities stay pinned. CI scope selection retains all tests and deployment gates.

The standard root development layout passed 107 server tests, 30 owning
integration cases, server typecheck/lint, frontend lint/65 tests/build/typecheck,
admin lint/8 tests/build/typecheck, control lint/13 tests/typecheck and CI selector
contracts. `validation.json` records source heads, log hashes and the resolved
local dependency-layout issue; no credential was changed.

Original protocol and browser measurements remain in
`perf/streaming-20261019/REPORT.md`. They describe local protocol stages and
synthetic browser rendering, not whole-product/provider latency. The independent
memory repeat in `streaming-memory-review.json` found no sustained growth in its
bounded 20-long-stream, three-four-way-burst and ten-cancellation sequence; it
does not establish long-term leak freedom. The original sampled peak increase
of 8.5% (about 11.4 MiB) remains disclosed.

The presentation and auxiliary artifacts here belong to the integrated 3.5.4
candidate. Prior 3.5.3 paired results and PR198 evidence remain unchanged. No new
migration is introduced. Release must follow exact-commit CI, immutable images,
matching runtime installation receipt and verified Komodo completion. The fixed
3.5.3 soak remains untouched.
