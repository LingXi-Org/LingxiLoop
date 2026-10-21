# Exact3.8 trace provenance candidate

Refs#283. Independent base37b8d70d211da4e1b44a6ff35ddf4e4d532ada47, root-reserved product0052. This branch changes only the DB migration/profile and their owning tests. No trace bridge/UI, public-text producer leaf, release driver, package manifest or lock is changed.

0052_run_trace_provenance requires exact runtime3.7.0/native14/control11/schema hash c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f and full validated51 names/checksums. It updates only installation runtime/timestamp to3.8 in the same transaction that records52. Target package admission requires exact runtime3.8.0/native14/control11/publicText2/runTrace1 and the same native schema hash. Historical0051 and0050 package profiles remain exact3.7 and3.6. Neither migration repeat nor Web/Worker startup adopts a damaged target. Full51->52 performs no DDL.

All51 historical product SQL files are byte-identical to the base. The upstream3.8 candidate has no DB SQL diff from formal3.7. See historical-checksums.json. Fresh installation still executes unchanged0050 then0051 then0052. The old0051 tests retain their failure boundaries and now expect52 after51; the broad migration test only appends52 to current-inventory results/counts.

## Evidence and limits

- Failure model and owning tests preceded implementation in commitf4965602. `red.log`:0/3, with actual isolated PostgreSQL proving the original runner stops at51 and pure package admission rejecting3.8.
- `green.log`:6/6 in4.4s, comprising four actual PostgreSQL cases for0051/0052 and two exact package-profile cases. Covers source mismatch/missing row/native/protocol/hash, checksum mismatch, atomic provenance+ledger rollback, fresh/repeat, target corruption refusal, native relation identity preservation and an event trigger forbidding DDL during the provenance upgrades.
- `historical-0050-green.log`:1/1 existing native13->14 and product-ledger rollback case passes. First invocation omitted the old test helper's INTEGRATION_DATABASE_URL and failed before DB access; retained as historical-0050-missing-env.log. No broader migration suite was rerun.
- `owning-typecheck.log`:the DB/profile and directly owning new/0051 tests compile successfully. `lint.log`:six affected TypeScript files pass.
- `typecheck.log`:full server compilation honestly fails at assistant-transport.ts:45 because its old reset fallback does not handle the new trace frame union. This bridge is owned by the trace contributor; no cast or unrelated product edit is made here. Formal combined compilation remains required.
- Tests use a labelled source overlay of upstream62966b7e5c9bdfc261dff1bd3e05bb25c64fc871 at /workspace/LingxiOS-public-run-trace. Portable source51 fixture restores only ledger/provenance after a fresh target52 install; it is synthetic metadata preparation, not a historical deployed-system proof.
- PostgreSQL used the existing cached pgvector/pg16 image in task-owned256MiB tmpfs, loopback32779, container lingxi-trace-provenance-pg. It was stopped and auto-removed after the checks. No image pull, new dependency installation, provider/browser/production API or private diagnostics access.

## Release boundary

Runtime3.8 is not formally published at this checkpoint. Both root/server manifests and locks remain formal3.7.0 by design; root coordinates the later exact registry lock without concurrent edits. This source draft must not be merged/released as a deployable candidate until the formal3.8 registry provenance, exact lock, trace bridge integration, independent review and exact CI pass. These source-overlay tests do not satisfy those gates.

The deployment descriptor must explicitly advance runtime3.7/full51 to3.8/full52 with unchanged native14/control11/publicText2 plus runTrace1 and all52 checksums. Do not reuse the3.7 same-schema release path or weaken its guards. The public migration entrypoint still runs existing education-plan upserts; it is not read-only. Producer enable state is preserved from whichever integrated source root selects. This PR alone neither enables native trace delivery nor completes#283.

## Reader fixture follow-up

Merge the independently reviewed reader test-only correction from PR289/head9bbb81b9128422efd94f95e957da883e24994b98. Preserve its historical range28 repair and current damaged-target refusal, then advance only the new current-inventory assertion and concurrent ledger count51->52 for this branch. Historical28 stays28. A targeted text assertion confirms these two exact52 values and the unchanged28 range; no new PostgreSQL/provider/browser run was requested or performed. PR289's3/3 formal3.7 receipt remains historical reader evidence, not an assertion that the new52 variant was run.

Normalize only trailing whitespace in this branch's archived red.log; original local bytes retained at /workspace/runtime380-provenance-evidence/red.raw.log, SHA256 fe444d77bd894dbab0858c09e888a24713d99cebca6143cd7a00246aff29fdbd. No test result/content is changed. The DB/profile implementation and0052 SQL remain byte-identical to cd35d7ed; formal3.8 pin and combined final checks remain pending.
