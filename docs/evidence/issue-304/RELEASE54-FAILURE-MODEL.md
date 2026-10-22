# Product 54 release boundary — issue 304

Written before implementation, baseline `a955a0f4`.

This is an offline release-driver change. Formal LingxiOS stays 3.8.2, native
schema 14, protocol 11 and the same published package integrity/tarball. Migration
54 is `run_presentation_contract`, checksum
`f58aafed796cabcb481bd381b4df298024d5effd0a576dae5e9638430aed38e2`.

Failure cases to cover before release:

- An old plan format silently accepts product 54, or a plan jumps from 52 to 54.
- Source 53 is incomplete/changed, historical checksums are altered, or the new
  54 checksum/name differs from the reviewed migration.
- A presentation-only product migration changes the formal native package,
  native schema/hash, protocol, public-text producer/reader, or trace capability.
- The four accepted source container identities change before drain; a target
  image differs from its immutable audit; seed proof fails before stopping writers.
- Migration starts before all four old services stop and repeated zero-lease
  checks complete, submits more than once, or starts a Worker before both Webs.
- A known migration failure is classified as safe rollback after product 54 has
  committed; an uncertain update is retried or followed by more external calls.
- An old product 53 binary is restarted against the full 54 ledger because the
  additive SQL was mistaken for backward reader compatibility.

Tests use synthetic, in-memory Komodo/DB receipts and real local release modules.
They exercise plan validation and exact command sequencing, not a production
deployment. Contract304 separately owns real isolated migration/new-old run replay
tests. This work does not edit migrations, old checksums, native runtime, indexes,
credentials or authorization. Existing GitHub 401 and production HTTP 403/1010
denials remain in force; no network operation is performed here.

## Local evidence

- Before implementation, all six new `presentation ` tests failed because the
  old release modules rejected the new format. After implementation, all six
  pass. Negative checks preserve independent source/target migration fixtures so
  a target-only historical checksum mutation cannot also mutate its source.
- The complete owning offline suite passed 67/67, with no skips:
  `node --test scripts/public-text-release.test.mjs scripts/host-release.test.mjs scripts/host-release-komodo.test.mjs scripts/host-release-transport.test.mjs`.
- The local Compose-policy subset passed the `effective candidate` parent and
  all four app/source-policy cases. The Docker execution test was not selected;
  no Docker daemon, image pull or production transport was used.
- All three changed runtime `.mjs` modules pass `node --check`.
- The migration owner's local SQL bytes independently hash to the reviewed 54
  checksum above. The existing 53 SQL remains at
  `733e035ba5de5aa5a9142c516e0364f83fe24e6dc0937e6045a89078371529dd`.
  This worktree does not own or edit either migration; the integrator must retain
  the same 54 bytes when assembling the candidate.

These receipts prove the release driver and synthetic command sequencing only.
They do not prove production state, publish a product 54 image, provide a 54→54
recovery command, or execute a live release. The separate
[runbook](../../host-release.md#product-53--54-presentation-contract) records the
required distinct 52→53 and 53→54 candidates and the old-reader refusal boundary.
