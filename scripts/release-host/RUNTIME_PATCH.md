# Product57 runtime provenance patch

`hostPlan.database.runtimePatch` is optional. Existing database plans keep their original behavior. The fixed database owner `main-runtime-a` accepts this one patch only:

```js
runtimePatch: {
  source: {runtime:'3.8.12',schema:14,protocol:11,schemaHash:'<64 lowercase hex>',
    productVersion:57,migrations:[/* all 57 ordered {version,name,checksum} */]},
  target: {runtime:'3.8.13',schema:14,protocol:11,schemaHash:'<same hash>',
    productVersion:57,migrations:[/* exactly the same named inventory */],
    integrity:'sha512-<formal package SRI>',
    tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.13/<40 lowercase hex>'}
}
```

Descriptors have exact keys, bounded size, unchanged native/product schema and full named checksum inventory. `database.from/to` must both be native14/product57 and `database.migrations` must match. Parameters remain `{}`. The immutable registered manifest supplies this input; requests cannot select a path, executable, SQL, environment value, or download URL. The package tarball is provenance passed to the packaged CLI for validation, never a host fetch instruction. The producer/controller still must bind the exact published package and immutable qualified image attestation.

The host retains maintenance drain/zero writer+lease+prepared/other-client barriers, exact final backup hash, confirmed private R2 archive and isolated restore verification. It independently qualifies the already prepared forward image and fixed Compose migration configuration/destination. The only extra commands override that fixed migration service entrypoint with `node --import tsx server/src/runtime-patch-bin.ts observe|apply`, using JSON stdin and `--no-deps --pull never`; credentials stay inside the existing service environment. Only apply receives `LINGXIOS_SCHEMA_UPGRADE_DRAINED=true`. Source/compatible recovery selection remains unchanged.

For this strict product57 patch, `restoreVerify` first completes the isolated restore and confirms its cleanup, then runs the fixed qualified forward-image `observe` against the real drained source before writing `restore-verified.json`. Only exact `state:'source',complete:false` with the matching plan hash qualifies. A package/checkpoint/source refusal here is a sanitized `RUNTIME_PATCH_PREFLIGHT_REFUSED` with `outcomeKnown:true,uncertain:false`: no CAS/migration intent exists, so the existing source restoration guard remains usable. Isolated restore or cleanup unknowns retain uncertainty and never enter this known read-only refusal path. Other database plans keep their existing restore/cleanup handling.

Before apply, the helper must independently observe the exact source and the host fsyncs an exclusive manifest/generation/plan/image-bound CAS intent and its containing directory. A confirmed apply is followed by independent target observation plus the owning target database profile/runtime/full named inventory assertions. Only then does the host fsync a separate migration dispatch intent and run the original `npm run db:migrate`. Successful completion retains the exact-image, exited-0 migration container proof.

Unknown CAS outcome or a restarted process never replays CAS. `migrateObserve` launches only the fixed read-only observer. Observed source keeps the operation unresolved. If observed target and the independent target profile, runtime, protocol, schema hash, exact 57 names/checksums, all drain barriers and backup/restore evidence agree, and no migration dispatch intent exists, it can prove the equivalent postcondition of this strictly unchanged product57 inventory. Its receipt says `migrationExecution:'not-attempted'` and `equivalentPostcondition:'unchanged-product57-exact-target-provenance'`; it does not claim the command ran. Once dispatch intent exists, only the original retained successful one-off proves completion. No GET observation starts a migration, creates a new operation, clears a lock or retries a write. Helper errors disclose no raw output or connection values.

Boundary tests use a fake Docker/CLI interface with real immutable host journal, backup files and persisted intent files. They cover committed CAS with lost reply, source observation after unknown, lost migration reply, exact target provenance, exit137, archive/restore gates and remote parameter refusal. Formal SDK13 image/package and disposable PostgreSQL validation remain release qualification requirements; this host-only change has not run those live tests and performs no production action.
