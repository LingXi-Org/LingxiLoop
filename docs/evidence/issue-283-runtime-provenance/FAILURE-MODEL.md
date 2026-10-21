# Runtime3.8 provenance: before implementation

Root assigned product0052 exclusively, base37b8d70d211da4e1b44a6ff35ddf4e4d532ada47. Upstream candidate62966b7e5c9bdfc261dff1bd3e05bb25c64fc871 declares runtime3.8.0/runTrace1/publicText2/native14/control11. No formal3.8 package exists at this checkpoint; source overlay cannot satisfy registry/lock/CI qualification. This branch owns only DB profile/migration and owning tests. No trace UI, bridge, producer leaf, release-driver or dependency-lock changes.

- Require exact3.7.0/native14/control11/schema hash c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f and all51 migration names/checksums before0052. Missing/corrupt installation, native version, runtime, protocol, hash or historical ledger rejects without adoption.
- The target package must be exactly3.8.0/native14/control11/publicText2/runTrace1 and the same schema hash. No >= version gate. Historical0051/0050 package profiles keep their exact3.7/3.6 contracts; missing predecessor milestones reject.
- Update only installation runtime/timestamp, in the same transaction as ledger52. An injected ledger insert failure must restore source provenance/history. Full51->52 executes no DDL and preserves native relation identities.
- An existing52 installation with damaged target provenance must reject both migration repeat and Web/Worker startup; never stamp it silently. A valid repeat must preserve installed_at and ledger timestamps.
- Fresh52 installation must traverse unchanged0050 then0051 then0052. The51 historical SQL and every earlier product/native SQL byte remain immutable. Existing migration-suite current-inventory expectations require only the appended52 item.
- Existing ensureEducationPlan upserts remain in the public migration entrypoint: this is not a read-only action. Runtime3.7/publicText2 producers/readers are unchanged here; separately reviewed release sequencing and formal3.8 pin are required.

Evidence plan: record the old runner's missing52 rejection on real isolated local PostgreSQL, then the narrow migration/profile contracts; preserve exact51 history checksums and focused0050/51 regression. Source51 in the portable test is a labelled synthetic fixture restoring only provenance/ledger after fresh target installation, as0052 has no native DDL. No provider/browser/production/private-data operation or broad suite.
