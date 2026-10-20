# Explicit native14 host maintenance

`scripts/host-release.mjs` accepts `native-schema-host-release/v1` only for
formal runtime3.5.8/native13/product49 → formal runtime3.6.0/native14/product50.
Protocol must remain equal, all49 historical migration names/checksums must
match, and the target's full50 inventory must match its exact Git objects.
The formal package/schema/hash come from public package resources and four
matching dependency manifests/locks. A claimed version in a descriptor alone
never qualifies a release. Numeric format2 maintenance remains unchanged;
ordinary and product-only formats cannot perform this native upgrade.

This runbook adds a native maintenance mode to the existing
[host release](host-release.md) contract. It does not choose real production
source/target commits, target package integrity, image identity or plan hashes.
The designated executor must use the actual accepted49 source and separately
qualified3.6.0 candidate. Source acceptance, exact CI, OCI audit, per-stack
Compose sources, cache/platform/layers, actual daemon image IDs and full
configuration/security/environment/volume guards remain mandatory.

## Offline plan

The descriptor has the existing host plan fields plus `backup`. Build that
nested value with the public source backup planner:

```sh
node scripts/verify-memory-backup.mjs \
  --profile native13-product49 \
  --source-sha "$acceptedSourceSha" --attempt "$uniqueBackupAttempt" \
  --output /absolute/new-source-backup-plan.json
```

This profile is independently pinned to the already published3.5.8 source,
its immutable schema13 hash and registry integrity, and a contiguous49-file
migration inventory. It never infers source provenance from the installed
3.6.0 target. The planner only reads Git objects and writes an exclusive local
file. It performs no network or database operation.

Copy the entire resulting JSON object into the descriptor's `backup` field;
its source must exactly match the host plan source. `validateHostPlan` rebuilds
the backup command from the source Git objects and validates all source and
command bytes. Do not supply a previous backup receipt or dump. Each attempt
has a new nonce, isolated database name and exclusive retained backup directory.
An already used directory cannot be overwritten, even if a process is rerun.

Seal and validate the descriptor through the ordinary offline host CLI:

```sh
node scripts/host-release.mjs \
  --input /absolute/native14-descriptor.json --output /absolute/native14-plan.json \
  --acceptance /absolute/accepted49.json \
  --source-audit /absolute/source-image-audit.json \
  --target-audit /absolute/target-image-audit.json
```

Use the exact reviewed formal target installation. Planning checks its public
release versions/schema and package version and rejects relabelled, absent or
wrong installed metadata. Explicit `--prepare-images` has the same existing
online-only behavior: all4 original services stay healthy; temporary pull
files are restored to source. No drain, backup, DDL or deploy occurs in image
preparation. Unknown pulls/writes stop without speculative restoration/retry.

## Authorized execution

Only the designated production executor invokes the existing host CLI's
`--execute`, with the sealed plan, the same evidence inputs and a new exclusive
receipt path. Existing injected Komodo authorization is reused. This mode:

1. Qualifies actual source state and both audited image caches. Stages exact
   final public app templates and narrow provenance/pull-policy fields with
   full readback. Core, gateway, environment, security and volumes stay fixed.
   Reads DB-free target metadata on both hosts before stopping anything.
2. Stops WorkerA, WorkerB, WebA, WebB, preserving all original container/image
   identities and requiring stopped PIDs. Reads two exact source13/49 states,
   separated by2s, with full visibility/read-only transactions and zero live
   work/session/attempt/capture/outbox leases, other clients and prepared
   transactions. Queued work is retained. Web background writers cannot remain
   online as they do during the product-only49 release.
3. Executes a fresh native Core postgres oneoff and binds its real Stack ID
   to the preceding host guard. It exports a repeatable-read read-only snapshot,
   creates a snapshot-consistent dump, and restores that dump into a new owned
   isolated database. Dynamic table counts and complete runtime/product
   provenance must match. Capacity checks, process-group timeouts and owned
   restore cleanup are unchanged. The dump is retained; only the freshly
   created isolated database is removed. No target migration runs here.
4. Requires the exact backup update ID, operation and Stack target, plus a
   fresh terminal reread agreeing on success/start/end. The3900s remote
   command remains inside the bounded70min native wait. Unknown statuses,
   conflicting receipts, lost acknowledgement, timeout or failed restore /
   cleanup prohibit migration. No backup retry is automatic.
5. Rechecks stopped identities, full source barrier, both cached target images
   and metadata, then the full barrier again. Submits once, on appA only,
   the existing public `server/src/migrate-bin.ts` from the qualified image.
   Only this native oneoff receives
   `env: { LINGXIOS_SCHEMA_UPGRADE_DRAINED: "true" }`.
   It is never persisted in Compose or a Worker environment. No private runtime
   API, copied native SQL, dependencies, ports, detach or image pull is used.
6. Requires native terminal success and the exact SHA/native14/product50
   marker, followed by fresh full14/50 installation and migration provenance.
   Recovers WebA, WebB, WorkerA, WorkerB in order, preserving environment,
   startup policy and each completed target's actual container/image identity.
   Final fresh DB state and all4 health checks are recorded. After new Web
   starts, the Worker barrier allows Web clients; legitimate new WorkerA
   leases do not block WorkerB.

A successful restore is evidence of source restorability, not proof that the
native14 migration works. The product integration's owning migration tests,
formal package/CI/image qualification and actual production receipts remain
separate gates. Preserve the public migrator's existing education-plan seed
upsert behavior and the release owner's canonical read-only seed check; this
operations change neither bypasses that entrypoint nor grants new permissions.

## Failure and recovery

The native adapter permits one backup and one migration submission per
execution. On uncertainty it records the known update ID and stops requests;
resolve that existing action before any separately reviewed continuation.
Known failures may issue one fresh state read for classification. Exact
unchanged13/49 is `source-unchanged-recovery-requires-review`; observed native14
or product50 is `fix-forward`. A failed/uncertain classification remains
unknown and never starts a service. After14 is committed, do not start old13
binaries, use historical native-down scripts, delete new state or rewrite
migration checksums. There is no automatic rollback/resume command.

Exclusive local receipt files, runtime advisory locks and repeated native
idle guards are not a distributed release lock. Keep one designated executor.
The release owner still seals the existing final HTTPS/version/readiness and
artifact evidence. This change adds no browser/provider test matrix and does
not claim provider latency or end-to-end model quality is verified.
