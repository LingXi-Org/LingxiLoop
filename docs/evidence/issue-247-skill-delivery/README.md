# Issue 247 product integration checkpoint

Base: `492bba8732a970a2ebf60f3c203a6e9cfb6173cc`.

## Implemented boundary

- The product skill opts into the public `product:visualize-delivery` checker.
  Eligible model context grants expose `skills.activate` alongside `skills.load`.
  The upstream skill body stays unchanged.
- Save, chart and diagram call the public transaction-bound host activation method
  after pure admission checks. A missing method fails explicitly. Read, export,
  authorization and verification never call that method. Authoring tools bump their
  semantic contract version so old prepared intents cannot silently change behavior.
- Native authoring writes persist their trusted request version on the existing
  document. Identical HTML saved in a later request updates this provenance and
  invalidates old page versions. Historical/ordinary HTTP writes retain NULL.
- The final checker examines actual literal candidate references, fresh audience
  authorization, saved PostgreSQL HTML/hash, ownership and current request version.
  Every referenced document must remain usable; at least one must be authored by
  this run/agent/principal in this request. Code examples and ordinary answers create
  no obligation. The checker uses the borrowed native transaction, including the
  capability resolver and indirect teacher/homework/context helpers.
- Native-confirmed unavailable contracts can resolve as `unsupported` only with an
  exact public non-delivery explanation. An arbitrary model failure claim, a narrow
  chart/diagram rejection or export limit is insufficient. Repairable/unknown gaps
  stay pending; native repair exhaustion owns terminal failure. No product code
  reads private receipts or writes native activation/resolution tables.

Readback establishes saved content and current access. It does not establish model
readback, browser execution, numerical correctness or all-provider quality. Final
delivery continues through the existing native result/outbox and IM receipt path;
the checker does not call the post-delivery page creation API.

## Migration boundary

`0050_skill_delivery.sql` adds one nullable positive request-version column. Native
13-to-14, this SQL and the product migration ledger share the existing installer
transaction and locks. The source installation must match 3.5.8/schema13; old-worker
and memory-capture drain checks remain active. Historical 0047 is fixed in migrator
code to 3.5.8/schema13, using the packaged public schema013 asset. SQL 0001-0049 is
unchanged, with pre-edit hashes retained in `HISTORICAL-SQL-SHA256SUMS`.

The installer rejects 0050 when the installed package is not the formal
3.6.0/schema14 target. Product code performs no runtime DDL. Schema14 rollback to
an old schema13 application is not covered; preserve data and fix forward through
the release owner's maintenance protocol.

## Checks and remaining gates

Before source changes, `FAILURE-MODEL.md` and owning PostgreSQL/native-worker tests
were written. `syntax-prepublication.json` records TypeScript syntax parsing only.
Historical SQL hash verification and `git diff --check` passed at this checkpoint.

Formal runtime `3.6.0` from source
`bbe5d4892ea1a805f5c923611bbd91d4320e472a` is now pinned in both
root/server manifests and locks. `formal-runtime.json` and
`dependency-qualification.json` retain the verified tar SHA256/integrity, packaged
schema14/schema013/native016 hashes and proof that all other lock entries are
unchanged. The formal package alone is extracted into this workspace's private
runtime directory; other dependencies are read-only symlinks to the existing
3.5.8 qualification tree. Shared dependencies remain untouched.

Local checks passed: `npm run server:typecheck`, `npm run server:lint`, and all four
pure `visualize-runtime.test.ts` tests, including the actual unchanged Python
standalone exporter. Their transcripts are retained alongside the initial typecheck
failure and its fixture fixes. Old direct-callback chart/diagram/admission fixtures
explicitly acknowledge the public host hook; they do not pretend to establish a
native activation transaction. The real scripted native-worker test owns that gate.

There is no local PostgreSQL/Redis binary or service after environment recovery.
Database/worker integration is **not locally run**. The existing draft-PR CI
integration job supplies PostgreSQL/Redis, migrates the disposable database and
runs the repository's selected integration suite. CI must pass on the exact final
candidate before this branch is integration-ready. No provider/browser matrix is
claimed or added.

The owning integration files are the following (CI uses its existing suite
selection on a dedicated disposable test database/Redis):

```
npm run test:integration -- --file migration.test.ts --file visualize-delivery.test.ts --file visualize-generation.test.ts --file visualize.test.ts --file visualize-runtime.test.ts --file visualize-numeric.test.ts --file visualize-diagram.test.ts --file visualize-quality-contract.test.ts
```

Record actual results and artifacts here before marking the branch integration
ready. Exact-commit CI and independent review remain gates; this checkpoint makes
no claim of passing unrun integration, browser or provider checks. No production
operation is performed by this branch.
