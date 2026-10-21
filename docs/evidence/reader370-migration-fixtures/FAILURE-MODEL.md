# Reader3.7 migration fixture correction, before edits

Exact main37b8d70d211da4e1b44a6ff35ddf4e4d532ada47, CI39637300381: checks(server) passes; integration119351458581 fails. Parent identified two migration.test.ts failures: the old recorded-patch repair fixture now records0051 before restoring native10, conflicting with the deliberate non-adoption gate; the concurrent migrator count still expects50 instead of51.

- Preserve historical automatic native repair coverage only for a historical migration range predating0051. Use explicit range28/native11, retain its recorded history, restore stale native10, then verify repair restores exact prior installation fields and startup readiness without creating a new product ledger entry.
- Current full51 damage must reject both migration repeat and startup. Capture installed provenance including timestamp, full ledger including checksums/timestamps and native version after damage; assert all remain unchanged after both attempts. Never alter production guards to satisfy an obsolete test.
- Concurrent migrators must still apply all51 entries exactly once: one complete ordered result, one empty result and ledger count51. Do not remove serialization assertions.
- Only owning fixture edits, no SQL/profile/runtime/producer/trace/lock changes. PR288/runtime3.8 work remains separate. Verify the two original failures first, then the historical/current repair boundary and concurrent case on a task-owned local PostgreSQL, using the already installed formal3.7 package. No provider/browser/production/whole-suite rerun.
