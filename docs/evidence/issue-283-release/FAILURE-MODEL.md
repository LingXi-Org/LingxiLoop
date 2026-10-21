# Explicit trace provenance release — before implementation

Scope: release scripts only, isolated branch based on37b8d70d. No production API,
SQL, registry installation/publication, candidate merge, private diagnostics,
reader370 helper or frozen194 driver changes. Formal3.8 is not published yet.

- Do not infer compatibility from equal native schema14. Admit only an accepted
  purpose-enabled3.7/native14/control11/full51 source and3.8/native14/full52 target.
  Check all51 historical names/checksums, reviewed0052 checksum2016fdcc9e095454f1a9fbd5fdffdaa4443c8918173dea8a324f88546123a886,
  native hashc56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f,
  actual publicText2/runTrace1, and retain the explicit enabled producer leaf.
  Reject generic >= profiles,3.8 patches, old readers, absent/unverified formal
  package/locks, changed history or unaccepted reader identities.
- Reuse formal four-lock derivation, immutable full-image identities, actual
  image metadata, qualified Node-only normalization, host/config/environment/
  security/volume guards. Trace capability must be verified from the installed
  formal package and the actual oneoff metadata before stop and migration.
- Accepted source must bind its enabled leaf hash and four current container/
  image IDs. Replacement must fail before staging; reader-only acceptance is
  insufficient. New success retains reader identities and adds runTrace1.
- The migration is the public entrypoint once on A, after a single read-only
  canonical seed equality check, four original services stopped and two fresh
  zero-lease barriers. Both Web deploy before either Worker. Do not inject
  native-upgrade env or run a native backup/DDL.0052 is provenance+ledger atomic;
  later existing education seed upserts still perform physical DML.
- Seed is a read-only snapshot, not a concurrency lock. Missing/different rows
  stop before drain. Unknown seed/migration/deploy stops all later requests and
  retains native ID; no automatic replay. Committed52 or trace writes require
  capable-reader fix-forward, never old-reader rollback or event rewriting.
- Count the actual existing adapter's successful operations (expected same
  structural8 preparation +31 provenance release), not a copied34 assertion.
  Pre-migration state is3.7/full51; post-migration is3.8/full52. No new browser,
  provider or migration matrix; narrow profile/engine/adapter regressions only.
- Source-overlay tests and synthetic descriptors are not formal3.8 publication,
  actual image, production acceptance, or trace delivery qualification. Existing
  current3.7 reader rollout must continue independently.
