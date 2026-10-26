# Minimal test-data releases

Use the existing single entry, with the qualified immutable manifest:

```sh
scripts/release/run.sh publish /absolute/qualified-manifest.json
```

No second publisher, background backup service, new credential or manual migration
command is introduced. The same receipt, deadline, idempotency and bounded recovery
rules apply. Re-running the same command observes the original attempt.

Ordinary releases with unchanged SDK/schema already omit all database phases.
For **forward product migrations with the same SDK and native schema**, the exact
app/Ops-bound contract attestation may explicitly set
`hostPlan.database.rpo: "test-data-no-backup"` on both runtime declarations.
The existing candidate builder puts the database operation on A only. This flag
is never inherited as a migration instruction by the next ordinary release.

The trusted A executor policy must independently opt in with
`allowTestDataNoBackup: true`. Its absence or any value other than boolean `true`
rejects manifest registration before claim/drain. Default plans continue using
`zero-committed-writes`. SDK/native upgrades and runtime provenance CAS cannot
use the exception. Both hosts still need their exact source/target profiles and
prequalified schema-compatible recovery artifacts.

The test flow prepares/verifies immutable artifacts, drains writers, checks the
exact source runtime/schema and unchanged migration prefix, runs the fixed
transactional migration command, verifies its retained exit and target ledger,
updates services and performs the existing local and business health checks.
Migration precedes admission of code requiring the new schema. It creates **no
backup**, uploads none, and does not run isolated restore verification. The
single-command receipt names the selected mode; a completed migration explicitly
records `backup: "not-created"` and `restoreVerification: "not-run"`.

## Risk and activation boundary

There is no guaranteed pre-migration data recovery point in this mode. A bad
committed migration can require manual repair; application recovery is allowed
only when compatible with the actual database. An unknown migration still retains
ownership for observation, never triggers blind replay, and cannot restore an
incompatible source. No tables, files, volumes or prior backups are deleted.

This change is code-only and **not enabled in production**. Activation requires
approval of the final exact new Ops/helper and Worker build, their existing
selectors, plus the single new A policy boolean above. It does not require a
credential, network, Docker or service-permission change. Clearing the boolean
disables future exceptions; it cannot recreate backups skipped by past releases.

For the accepted product58 release on 2026-10-26, backup and isolated restore
occupied 246.838 + 31.896 = **278.734 seconds** of the 755.342-second command.
This identifies the removable stages, **not a measured speedup**. No release has
yet exercised this new mode; cache/transport and other stages vary.
