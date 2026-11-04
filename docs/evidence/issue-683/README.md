# Issue 683: Slides write verification and observable fields

Baseline: LingxiLoop `8cc00fd8`; original published consumer runtime `3.8.24`; this candidate pins formal `3.8.25`.
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

Upstream PR https://github.com/LingXi-Org/LingxiOS/pull/90 is merged and formal maintenance `3.8.25` is published. This candidate uses its exact registry pin and regenerated root/server/scoped locks. Normal npm registry installation and packing succeeded; archive SHA-512 and shasum match the registry and locks (see `registry-3.8.25.json`). It verifies successful receipts with current authorized readback, scans latest-to-earliest, retains original fields/mismatches/observations, and records the final proving receipt per substituted field. Candidate selection binds work/request version, tenant, principal, agent, session and thread. Unknown, pending approval and unavailable readback remain unconfirmed. Inconsistent observed values cannot establish a replacement proof.

A failed or `not_observed` `task.check_resource` observation no longer resets the no-progress correction allowance. This preserves the gap and bounds futile correction; it does not turn a failure into success or bypass outcome checks.

## Validation and boundaries

- Product `server:typecheck`: passed again with the exact published `3.8.25` dependency.
- Product `server:lint`: passed (599 files).
- Product `server:test`: 187 passed, 0 failed, including the three added summary/guidance regressions.
- Upstream build and 67 focused receipt/selection/protocol/timing assertions: passed on the maintenance candidate. The receipt regression includes 14→10→1→1→1, external changes, missing files, explicit deletion, unknown/approval/absent/no-effect receipts, unavailable readback, different resources, inconsistent concurrent reads, and a real PostgreSQL (PGlite) scope matrix.
- A direct upstream control-plane resource matrix confirmed `pass`, `fail`, and `not_observed` for both synthetic `slides.current` and `slides.check`, including untraversed dotted paths. Its resources were synthetic; it is not a browser or real-model result.
- A first selected-integration attempt bootstrapped the actual formal 3.8.21→3.8.24 test database, then stopped before tests because the CLI selector was mistakenly `--files=`; rerun uses the supported `--file` selector.
- Product selected integration `npm run test:integration -- --file slides-workspace-flow.test.ts`: 4 passed, 0 failed, 0 skipped; 12.3 s test execution (database bootstrap excluded). The fixture uses real PostgreSQL, authorization, published SDK, CAS, durable IM recording and a scripted provider; it includes `slides.current` and `task.check_resource` in the native worker path.
- Real-provider before/after repeated Slides samples, browser save/reopen/export acceptance and a measured latency/token reduction have not been established by these checks. The historical 690.973 s run is not a matched benchmark. No speedup claim or production completion is made.

## Product62 runtime bridge

Only `3.8.24 → 3.8.25` over the identical complete product62 inventory is accepted. The deployment plan, CLI descriptor parser, CAS and read-only observation entrypoint accept this exact pair. New-version startup requires already-installed product62 and matching formal25 provenance and performs no DDL. Formal24 remains the only package allowed to add migration62 to product61; its historical test runs with the actual integrity-checked formal24 archive. No historical migration bytes change.

The bootstrap proves the actual published formal24/product62 source before applying the formal25 CAS. Negative integration covers wrong source/target, partial ledgers, other clients, retained Slides checkpoints, and a lost COMMIT acknowledgement followed by read-only observation. It does not delete or rewrite pending work to clear the barrier. The native Slides Worker regression now also executes 14→10→1→1→1 writes, requires persisted per-field supersession evidence, and checks readback, resource summary, durable delivery/replay and idempotent duplicate handling.

A first product62 negative run found the observation allowlist still limited to product61 (3 pass/2 fail); it was corrected before the successful rerun. A temporary test type error (`null` CAS precondition inference) was also corrected. These are retained development failures, not release qualification.

Final local bridge validation: 29 passed / 0 failed / 0 skipped across five selected integration files, plus 43 deployment/bootstrap/scope/selector assertions. `product62-validation.json` records the file timings and boundaries. The native chain reaches satisfied with all five successful writes persisted once. Earlier 3.8.24-only integration evidence above is retained as baseline, not substituted for this qualification.

## Integration handoff

Only task `01a19a90-dfc4-77f7-9803-e9035c481026` merges and deploys. Upstream publication and exact registry qualification are complete. Independently review the final candidate, require its green product CI, and serialize its runtime bridge/production rollout with #672. The existing preflight must find no live or incompatible resumable runs; respect retained work rather than forcing the counters to zero. After the CAS, deploy only commits compatible with formal25 provenance. Merging or queueing deployment is not production acceptance. Real-provider performance/browser verification limits above remain; do not report a measured speedup.

Coordination with #670 / PR #672 (`01a1a698-ceb6-7563-b266-07d3d4c6a0dc`): the existing PR owns Visualize retirement. This change adds no Visualize tool/asset changes; the observed three `visualize.save` calls are not needed to validate Slides receipts. Its only overlapping changed file at inspection was `scripts/run-tests.mjs`; retain both test entries when integrating. Recheck overlap on the final heads.


## Product62 global barrier follow-up

Independent integration review found that the original binding/checkpoint predicate omitted queued/waiting work whose `meta.harnessHash` was already pinned. Before the fix, five new real-PostgreSQL regressions failed with “Missing expected rejection”; the original five tests still passed. Thus the earlier green CI did not qualify the global barrier.

Product62 preflight and CAS now count **all** queued/leased/waiting items of every work kind, even without a runtime step or active lease. The historical default barrier mode and product61 bridges retain their previous semantics. The new mode is selected explicitly at every product62 patch entrypoint. No work status, payload, binding, harness pin, or checkpoint is rewritten or deleted by the release path.

After a refused CAS, read-only observation may identify the exact unchanged source despite retained work, provided every other maintenance counter is zero and there are no other database clients. The existing deploy orchestrator can then restart the already captured source container identities and retain the attempted intent for review. This exception applies only to product62 **source**, never target or unknown provenance; it does not authorize CAS replay. Active work/leases, live outboxes, prepared transactions and unknown observations still keep writers stopped. Already-installed target preflight retains ordinary same-runtime convergence behavior.

Verification: 25 real PostgreSQL checks across the new product62 matrix (10) and the actual formal24 historical product61 suite (15), zero skips; 24 deployment orchestration tests; server typecheck and lint passed. The matrix checks unstarted queued/waiting/expired leased pinned work, raw global count1, unchanged rows/provenance on refusal, work arriving after preflight, known-source readback, other-client/live-lease refusal, target/unknown refusal, and terminal-work acceptance. Deployment recovery assertions use recorded callbacks; no production containers were stopped or restarted.

This follow-up edits only `runtime-patch.ts`, its two owning regression files, and evidence. #672's CI, Dockerfile and context/teaching-rule conflicts remain with its owner/integrator; preserve upload packaging and teaching requirements there. No production action is performed by this contributor.
