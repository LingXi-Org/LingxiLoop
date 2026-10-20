# Issue 216 source backup preparation

This tool backs up and restores the **source** state only: product migration46,
formal LingxiOS3.5.6, native schema12/protocol11. It does not execute the future
memory migration, backfill, provider requests or deployment. Every successful
receipt explicitly records `migrationRehearsal: "not-performed"`.

The failure model and tests precede implementation. Work is on the independent
`codex/issue216-backup-readiness` branch. This preparation made zero production
requests and changed no runtime dependency, migration or deployment file.

## Review and use

The script uses Node built-ins and the local Git object database. The source
release's registry integrity and schema hash are pinned from formal3.5.6, so a
later installed target dependency cannot silently change the source predicate.
The local test independently compared that schema hash with the installed formal
3.5.6 schema resource. The source commit's two manifests, both dependency locks
and all46 migration version/name/checksums must match. Production is checked
against that entire ledger and exact installation/schema provenance within its
read-only snapshot. The source SHA identifies those expected code bytes; the
release owner must separately confirm the actual deployed application images.

Default invocation only creates a new, private local plan:

```sh
node scripts/verify-memory-backup.mjs \
  --source-sha 2ea8615c17c9ed11b769c83c699719dc01c11ee4 \
  --attempt issue216-owner-reviewed-01 \
  --output /tmp/issue216-source-backup-plan.json
```

Review its exact source, command, unique database name, backup path and hash.
Only the sole release owner may later execute that **same saved plan**, through
the existing injected Komodo environment, after current inventory/capacity and
operation authorization are confirmed:

```sh
lingxi-prod run node --use-env-proxy scripts/verify-memory-backup.mjs \
  --execute --plan-file /tmp/issue216-source-backup-plan.json \
  --output /tmp/issue216-source-backup-receipt.json
```

Neither command was executed against production during this task. Changing the
script or source descriptor invalidates an older plan; regenerate and review
rather than editing the command/hash manually. Output files require exclusive
creation with mode0600. Credentials come only from the existing injected
`KOMODO_API_KEY` and `KOMODO_API_SECRET`; the existing postgres service supplies
its own database environment. No credential values appear in arguments or files.

Execution is restricted to the known HTTPS origin and
`RunStackService(lingxiloop-core-state, postgres)`, with no TTY/dependencies/ports/
pull. It creates a one-off service operation, a server-volume dump and an
isolated restore database; it is not a read-only Komodo operation. Source SQL is
read-only. No source DDL, migration, business UPDATE or data reset is performed.

## Backup and recovery boundaries

One read-only repeatable-read transaction exports the snapshot and gathers all
ordinary/partitioned public and native table counts plus exact provenance.
`pg_dump --snapshot` uses that same snapshot while its owner remains alive.
The dump stays in the original server volume under a private, exclusive attempt
directory; the parent path must resolve physically to the reviewed path.
A random, fully guarded isolated database receives `pg_restore --exit-on-error`.
Exact counts and provenance must agree before owned-database cleanup completes.
Only then are the success receipt and completion marker emitted. Existing
restore databases are never adopted or dropped, and retained dumps are not
removed by the production tool.

Capacity checks require2× database size +512MiB before dump, then1× +512MiB before
restore. They are point-in-time checks, not storage reservations. The full remote
command has a65-minute ceiling plus75 seconds for termination/cleanup; stage
connection, SQL, lock and process deadlines also apply. Local polling is bounded
at70 minutes. Local signal cancellation stops the wait/request and records an
**uncertain remote outcome**; it does not claim to cancel an accepted remote job.
No Execute request is retried automatically. A failed or lost createdb response
can leave an unconfirmed restore database; inspect its recorded full name and
update before cleanup. Complete/success:false stays failed, and missing/malformed
markers never become success. Raw stdout/stderr or network exception objects are
not replayed to the caller.

A verified online dump excludes later writes and is not a maintenance freeze or
a synchronized snapshot of WuKongIM/R2. `verifiedAt` is the completion observation,
not a claimed final recovery point. Never restore it over newer production
writes or revive forgotten content. Actual target-schema migration rehearsal,
Web/Worker drain, zero live leases/claims, compatible recovery and final rollout
remain separate required gates. The source restore tool does not weaken them.

## Local verification

The six contract tests replace fetch; no remote endpoint is contacted. They
cover source/command tampering, default planning, fixed service targeting,
receipt ambiguity, lost acknowledgement and cancellation without resubmission.

```sh
node --test scripts/verify-memory-backup.test.mjs
```

Five opt-in integration tests use a **new synthetic `_test` database** on the
existing localhost55432 fixture. The test verifies the known local container's
loopback port binding before using it. It substitutes only local host/output
paths in the generated command, executes PostgreSQL's real snapshot/dump/restore
programs and cleans only its owned synthetic databases and private `/tmp` files.
It never calls `executeMemoryBackup`, Komodo or a provider.

```sh
# Supply the existing synthetic localhost55432 /postgres fixture URL, not a
# product/production credential. Ordinary product synthetic test env is needed
# by the explicit local database installer.
MEMORY_BACKUP_LOCAL_TEST=1 \
MEMORY_BACKUP_LOCAL_DATABASE_URL="$LOCAL_SYNTHETIC_POSTGRES_URL" \
node --test scripts/verify-memory-backup.local.test.mjs
```

Actual results:6/6 contract tests and5/5 local PostgreSQL tests passed. In the
concurrent-write case the source advanced from10 to11 rows after snapshot export,
while both the dump snapshot and restored table remained at10. The suite also
verified duplicate attempt refusal, preexisting database preservation, wrong
source provenance rejection, real pg_restore failure cleanup, and capacity
refusal before snapshot/restore. Syntax and focused lint checks passed.
See `validation.json`, `local.json` and the checksum manifest. Production backup,
actual candidate migration, live provider and soak acceptance remain unverified.
