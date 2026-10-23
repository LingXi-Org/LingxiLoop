# Producer v2 release contract failure model

This work changes release validation only. Runtime 3.8.4 is not a qualified candidate for this delivery. Synthetic 3.8.5 descriptors below are fixtures, not evidence of publication or production readiness.

Before implementation, the required negative and positive boundaries are:

- Only a forward `runtime-patch-host-release/v1` with unchanged native14, protocol11 and the complete product54 inventory may change `purpose-json-v1` to `purpose-json-v2`. A new exact deployment leaf SHA is required for that transition.
- Producer v2 requires runtime 3.8.5 or a later reviewed 3.8 patch on each side advertising v2. Version alone is insufficient: the existing formal installed package, all four committed manifests/locks, immutable image/all-layer audit, actual publicText2/runTrace1 and exact leaf/model options remain required.
- Same54 image-only releases may retain v1 or v2 only with the same producer, package provenance and deployment leaf SHA. They may not activate v2 implicitly. Forward runtime patches retaining a producer also retain its leaf SHA.
- Reject disabled/unknown producers, v2 downgrades, reader changes, prior/prerelease/different-family runtimes, missing four source identities, changed native/product inventory, full configuration or audited environment drift.
- All historical reader/producer/trace/repair/presentation profiles and current-source52 acceptance keep their existing v1 boundaries. No historical migration or recovery path gains v2 permission.
- Actual target model options must come from the validated target producer, including the command that rechecks metadata immediately before provenance CAS. Hardcoded v1, missing/wrong options, capability mismatch or a wrong leaf SHA must fail.
- Preparation must keep services healthy; incompatible bound/checkpoint work must fail before stopping. A qualified runtime patch still drains four writers, verifies two zero barriers, applies one provenance CAS and starts two Web then two Worker containers, with no DDL, seed or added database operation.
- Unknown CAS outcomes remain non-replayable; identity/lock/recovery checks and production access rights are unchanged.

Owning offline checks are the existing public-text plan, host-release orchestration and native Komodo adapter test suites. No production call, package publication, deployment leaf change or runtime dependency update is part of this branch.

Before implementation, `node --test scripts/public-text-release.test.mjs scripts/host-release.test.mjs scripts/host-release-komodo.test.mjs` produced 94 tests: 88 passed, 6 failed. The failures were the new v2 activation, actual metadata, orchestration and adapter cases; the existing v1 contracts remained green. This is offline synthetic contract coverage, not a production receipt.

A changed producer exposes one additional existing assumption: before a confirmed CAS, source restoration must compare metadata with the accepted **source** producer/options/leaf, not target v2. Add failing source-side metadata and native restoration checks before changing that call. Restoration eligibility, original identities, complete native receipts and exact unchanged source provenance still govern whether recovery is allowed.
