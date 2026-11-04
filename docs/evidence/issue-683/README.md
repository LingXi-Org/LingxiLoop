# Issue 683: Slides write verification and observable fields

Baseline: LingxiLoop `8cc00fd8`; published consumer runtime `3.8.24`.
Upstream fix targets LingxiOS `release/3.8` at `9e5742a`, preparing `3.8.25`.
Do not install the unrelated 4.x slim branch or edit installed dependency internals.

## Product contract

`slides.current` retains `{deck, decks, editor}` and adds only observable saved-index fields:

- `title`: the string in saved `project/deck.json`, rather than inferred deck metadata.
- `slideCount`: the number of unique, nonempty string IDs in its `order` array, including zero for an empty array.
- Missing/unparseable index fields stay absent. `task.check_resource` must retain `not_observed` for absent fields.
- `slideCount` counts index entries; it does not certify file existence, authored content, browser rendering or export. `slides.check.problems=0` certifies the format check's scope only.

The Slides skill explains the shallow resource contract and incremental saves: save one complete editable slide with its valid index first, then small batches; preserve existing files and fulfilled answer text. This is guidance, not a measured latency improvement.

## Upstream ownership

Upstream draft PR: https://github.com/LingXi-Org/LingxiOS/pull/90 (`e17155e`). The runtime fix must ship through the formal maintenance package before the product can claim chain-verification acceptance. It verifies successful receipts with current authorized readback, scans latest-to-earliest, retains original fields/mismatches/observations, and records the final proving receipt per substituted field. Candidate selection binds work/request version, tenant, principal, agent, session and thread. Unknown, pending approval and unavailable readback remain unconfirmed. Inconsistent observed values cannot establish a replacement proof.

A failed or `not_observed` `task.check_resource` observation no longer resets the no-progress correction allowance. This preserves the gap and bounds futile correction; it does not turn a failure into success or bypass outcome checks.

## Validation and boundaries

- Product `server:typecheck`: passed with the exact published `3.8.24` dependency.
- Product `server:test`: 187 passed, 0 failed, including the three added summary/guidance regressions.
- Upstream build and 67 focused receipt/selection/protocol/timing assertions: passed on the maintenance candidate. The receipt regression includes 14→10→1→1→1, external changes, missing files, explicit deletion, unknown/approval/absent/no-effect receipts, unavailable readback, different resources, inconsistent concurrent reads, and a real PostgreSQL (PGlite) scope matrix.
- A direct upstream control-plane resource matrix confirmed `pass`, `fail`, and `not_observed` for both synthetic `slides.current` and `slides.check`, including untraversed dotted paths. Its resources were synthetic; it is not a browser or real-model result.
- A first selected-integration attempt bootstrapped the actual formal 3.8.21→3.8.24 test database, then stopped before tests because the CLI selector was mistakenly `--files=`; rerun uses the supported `--file` selector.
- Product selected integration `npm run test:integration -- --file slides-workspace-flow.test.ts`: 4 passed, 0 failed, 0 skipped; 12.3 s test execution (database bootstrap excluded). The fixture uses real PostgreSQL, authorization, published SDK, CAS, durable IM recording and a scripted provider; it includes `slides.current` and `task.check_resource` in the native worker path.
- Real-provider before/after repeated Slides samples, browser save/reopen/export acceptance and a measured latency/token reduction have not been established by these checks. The historical 690.973 s run is not a matched benchmark. No speedup claim or production completion is made.

## Integration handoff

Only task `01a19a90-dfc4-77f7-9803-e9035c481026` merges and deploys. After upstream independent review and green maintenance gates, merge to `release/3.8`, require the exact merged SHA's release gates, tag/publish `v3.8.25`, and verify registry integrity. Then consume the exact published pin through the existing runtime patch/profile process, regenerate scoped dependency manifests/locks, and rerun affected product integration and final CI before the single production rollout. This PR alone intentionally retains `3.8.24` until formal publication; it must not close #683 as fully resolved.

Coordination with #670 / PR #672 (`01a1a698-ceb6-7563-b266-07d3d4c6a0dc`): the existing PR owns Visualize retirement. This change adds no Visualize tool/asset changes; the observed three `visualize.save` calls are not needed to validate Slides receipts. Its only overlapping changed file at inspection was `scripts/run-tests.mjs`; retain both test entries when integrating. Recheck overlap on the final heads.
