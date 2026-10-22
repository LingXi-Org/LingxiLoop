# Public display projection evidence

Baseline: product main `d5481cd258058784e7004169b5ef1235460384f1`, published LingxiOS 3.8.2, native schema 14, product schema 53. All records below are controlled local fixtures. No production/private run was read, and no production endpoint was retried.

## Implemented contract

- Existing activity version 1 accepts bounded optional `purpose`, `requestVersion`, `order`, `revision`, and `taskId`; `kind=result` identifies an explicit result. Missing purpose remains unknown for legacy rich content.
- Native v2 public text uses its actual source identity across the `response.committed` event and committed message read. The accepted prefix remains inert archive content with a separate identity. New requests, newer execution fences and superseded candidates retain their resets.
- The original first event sequence establishes activity order. The current run watermark and tool event revision establish freshness; pagination retains the existing run/request/fence metadata and structural bounds. It never substitutes for live control state.
- Resolved approvals become process receipts. An unconfirmed side effect (`status=unknown`) remains current attention even when the overall goal is satisfied; a 90-tool bounded fixture verifies it is retained in the main snapshot.
- Explicit producer research purpose and validated homework locators distinguish results from process. Old research receipts without purpose and unmarked native memory receipts remain visible. Memory inspection results can use the separately registered `memory-summary` presentation.
- Trusted final generative presentations carry result annotations. Registered data results, including citation claims and presentation artifacts, retain their existing strict wire shape and remain in the body. No arbitrary part IDs or new data metadata fields were introduced.
- Citation source identities include both source and version; chunks of the same version are retained. Distinct versions do not collapse.
- Task cards come only from explicit authorized child-run spans with a complete, acyclic parent path. Their IDs equal the IDs in the actual visible trace tree; clipped trace spans are excluded. Root tools are not assigned to unrelated child tasks. No descendant tool contents are fetched.

## Checks

The failure model was recorded before product changes. The initial accepted-handoff/order tests failed on main. Additional regressions first reproduced stale execution-fence identity, legacy rich receipt misclassification, missing bounded unknown attention, and strict data wire rejection.

- Related projection, actual AssistantTransport encoder/decoder, replay, and 1,100-call bounded history tests: 31 passed. The history fixture uses `advance` for construction; each final bounded page is still validated, and separate v2 tests cover incremental snapshots.
- Native purpose, existing visualize activation/privacy boundary, and diagnostic-copy regressions: 11 passed.
- Compatibility/attention/transport checks after the legacy-purpose fix: 19 passed.
- Final owning answer-first suite: 8 passed, covering first-character streaming, accepted handoff, repair, new request/fence, homework results, resolved approvals, ordering, bounded attention, legacy raw replay, and versioned citation data.
- Focused Biome checks and the final server TypeScript check passed.

To regenerate browser fixtures, run `server/src/__tests__/answer-first-projection.test.ts` with `ISSUE304_SNAPSHOTS` set to a writable JSON path. The export contains the real v2 event fixture and snapshots produced by the product projection: firstAnswer (one character), liveAnswer, acceptedPending, accepted, correction and newRequest. Browser checks consume these through the official transport/store path; this is synthetic input exercising real product code, not evidence from a live model or private production conversation.

## Approved product54 compatibility migration

The parent explicitly approved the additive product54 migration while keeping formal LingxiOS3.8.2 and native14. `0054_run_presentation_contract.sql` adds only nullable `agent_run_bindings.presentation_version`; no default1, historical backfill, native schema change, real-index change, or historical SQL/checksum rewrite occurs.

Only the host's non-deduplicated native IM admission receipt supplies version1 for an initial binding. The same applies to public handoffs; authorized native descendants may inherit an already-marked parent/root generation. Routine admission and its binding use the existing shared transaction. On conflict the first stored value, including NULL, is preserved. Readers fetch the marker using the exact tenant/agent/principal/session/thread identity before replay; live, reconnect and activity pages share it.

A native ingest can commit before the product binding is written. If that callback is lost, or an unmarked context binding wins the race, a later deduplicated receipt cannot prove newness. That run stays NULL and its rich native memory remains visible. This is a deliberate, regression-tested conservative boundary, not claimed complete recovery of missing provenance. Existing unmarked runs and descendants of unmarked roots are not upgraded by clock, ID pattern, reader version or repeated execution. Explicit result presentations remain outside process activity.

Local product54 evidence is in `PRODUCT54-RESULTS.md`, with the preimplementation failure inventory in `PRODUCT54-FAILURE-MODEL.md`. The supported sequence from the latest public52 receipt is unchanged0053 then0054. A product53 reader rejects a database containing54; after migration, recovery must retain a54-aware reader and use fix-forward. No database downgrade or automatic retry is provided.

No remote GitHub operation or production deployment was executed in this phase. The existing GitHub401 and production403/Cloudflare1010 denials remain in force.
