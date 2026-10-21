# Exact trace provenance release profile

Refs#283. This release-tool branch is based on37b8d70d211da4e1b44a6ff35ddf4e4d532ada47.
It does not change the product migrator, migrations, producer leaf, package locks,
Compose, current reader370 helpers, or frozen194 driver. Root remains the sole
integrator and production executor. No production API/SQL, registry/download,
package install, provider request, private diagnostics or paused soak operation
was performed by this work.

`run-trace-provenance-host-release/v1` is an explicit additional profile. Source
must be **accepted and purpose-enabled formal3.7/native14/control11/full51**;
target is **formal3.8/native14/control11/full52**, publicText2/runTrace1. Both
source and target public-text deployment leaves retain
`{reader:2,producer:'purpose-json-v1'}`. A reader-only source is rejected. Source
acceptance binds the actual leaf hash and four current container/image IDs;
replacement fails before host staging. This branch cannot qualify a source
that has not yet completed the separate producer release.

Native hash remains
`c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f`.
Every historical51 name/checksum must match. The only new product row is
`0052_run_trace_provenance.sql`, SHA256
`2016fdcc9e095454f1a9fbd5fdffdaa4443c8918173dea8a324f88546123a886`,
reviewed from PR288 commitcd35d7ed78e9d77c2ebc5de139c16b60e83bdff2 and confirmed
with its author. The SQL/runner update installation provenance and ledger
atomically; native DDL is unchanged. This branch does not copy or edit that SQL.
Exact3.7 reader/producer and old same-schema guards remain unchanged; no generic
version range,3.8 patch,3.8-to3.8 release, or downgrade is newly admitted.

## Minimal source changes

- `scripts/public-text-release.mjs`: explicit trace format, exact full52
  inventory/profile, enabled-source requirement and actual runTrace1 metadata.
- `scripts/host-release.mjs`: reuse the provenance upgrade sequence, source
  reader identity check, canonical definition validation and fix-forward
  classification. Successful trace output includes runTrace1 and actual readers.
- `scripts/host-release-komodo.mjs`: use public releaseVersions.runTrace in
  DB-free metadata and the equality guard before the public migration entrypoint;
  allow the existing four-service stop/seed/one-migration path only for this format.
- `scripts/schema-upgrade-maintenance.mjs`: installed formal3.8 must additionally
  advertise publicText2/runTrace1. Existing runtime/schema/protocol/hash/version
  checks remain. No target package is installed by these scripts.

Formal source/target descriptors still come from all four exact committed
manifests/locks and every migration byte. Validation requires real successful
exact-target CI, accepted source, full immutable image audit and tracked public
Compose bytes. Existing image identities, qualified image-derived Node metadata,
configuration/environment/security/volume protections and fresh terminal
readback remain in force. Only public byte content is written to host Compose.

## Ordered operation and recovery contract

The existing adapter test proves **39 native operations =8 preparation +31
trace release**; this is not inferred from the prior34 same-schema recipe.

Preparation stays2 source-state reads,4 public file writes and2 image pulls,
preserving four original healthy containers and restoring source templates.
The release is2 public file writes,2 target metadata probes,1 canonical seed
read,4 stops,1 A migration,4 deployments and17 state reads. The first4 release
state reads require3.7/full51; the remaining13 require3.8/full52. Four application
readers/writers stop (Worker A/B, Web A/B); two fresh zero-lease barriers precede
migration, separated by the existing2-second wait. Both Web targets deploy
before either Worker. New Worker A may begin work before Worker B starts; the
driver does not impose an invalid global-zero requirement after Worker A.

Use the existing `host-release.mjs --prepare-images` then `--execute` interfaces
with an independently reviewed actual sealed trace plan and exclusive output
files. Source/target SHA, formal3.8 integrity/URL, image/CI/Compose references and
source acceptance are intentionally **not supplied by this source PR**. Root
must bind them after the actual producer release and formal3.8 qualification.
The eventual collector must require the actual39 IDs, exact Stack/operation/
Complete/success/timestamps, target metadata including runTrace1 and enabled
leaf/options, the one seed marker, one MIGRATED marker, and the correct
source51/target52 state boundary. No current reader370 receipt is rewritten.

The canonical seed query is read-only and validates the existing fixed plan,
eight entitlements and eight associations. It is a snapshot, not a concurrent
administrator lock. Public `db:migrate` still performs existing physical
education-plan upserts after0052; the full migration is **not read-only**.
Because native schema14/SQL remain unchanged and0052 is provenance-only, this
profile does not invoke native snapshot/restore/DDL or inject the native-upgrade
environment marker. It does not replace the existing native-upgrade backup gate.

Before52 commits, a known failure may classify exact source unchanged for a
separate reviewed recovery. After52 commits, old3.7 startup provenance differs;
recovery is fix-forward to capable target readers. Existing v2 history already
precludes strict3.6 rollback. Unknown seed/migration/deploy outcomes retain the
native ID and stop all further requests. No automatic replay, event deletion,
history rewrite, config weakening or fallback to old readers is allowed.

## Evidence and pending qualifications

Failure model and five new cases preceded implementation in commit6ec28564.
`red.log` records51 existing passes and5 expected new-profile failures.
`first-green-attempt.log` records55/56: one negative fixture accidentally shared
source/target migration object references; serializing the fixture before the
single-target mutation fixed the fixture without weakening a production guard.
`green.log` records56/56 in446ms. The same four owning suites cover exact
profile rejection, enabled acceptance/identities, metadata missing/wrong runTrace,
actual adapter8+31 ordering, no extra env/backup, seed/unknown stopping, and
postcommit fix-forward. Existing CI deploy-contract selectors already include
these files; no CI matrix was expanded.

The package capability API is public `releaseVersions.runTrace === 1` from the
upstream3.8 candidate. Formal3.8 publication, real four-lock target integration,
final application CI/image, source producer acceptance and production migration/
health receipts remain **unverified** here. Synthetic descriptors and adapter
calls are local release contracts, not formal package or production evidence.
The owning product migration's PostgreSQL evidence belongs to PR288; it is not
rerun or relabelled by this script PR. No browser/provider matrix was added.
