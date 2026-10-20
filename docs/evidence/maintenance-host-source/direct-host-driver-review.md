# Independent review of the direct host-source driver

Reviewer: `/root/host_preparation_review`, 2026-10-20. Scope: local static inspection, local Git blob checks, an exact local process-presence check and existing local tests. No production/API request, configuration/file write on a host, credential inspection, service action, migration, backup or deployment was performed.

## Decision

**No P1/P2 finding blocks executing this narrowly scoped online staging driver.** No code change is required by this review. The conclusion binds only:

`/tmp/lingxi-358-production/prepare-direct-host-sources.mjs`

SHA-256 `b9265a1403b818eb5c8ecbb19fd6246c3e4dc09ce90df778c54dd9a512b2e8b7`.

The prior failure model was written before implementation and inspected: `/tmp/lingxi-358-production/DIRECT-HOST-SOURCE-FAILURE-MODEL.md`, SHA-256 `16836564e89065b5864a095345608d6eac08da40d8625c7a39ccfb553b84747d`.

This review does not claim the production clone's terminal response has independently been read by this reviewer, that staging has run, or that a maintenance window is qualified. The driver itself must pass all fresh remote conditions and retain terminal receipts.

## Checks of the actual driver

- It validates the sealed format2 plan before operations. Plan hash remains `67db9eb7800edda238fb8e9a72dbcb28793f50314a92a731c361874842ac0849`, with the exact three f56 manifest hashes, d107 immutable target, old ac906 source and a fresh backup attempt.
- It rejects a still-running original driver using an exact anchored process match. My local read-only `pgrep` check also returned no such process. It hashes and records the original receipt, requires its stopped/incomplete state and exactly the known pending action inventory. The inspected original receipt SHA is `1cb89f3812661b5414b9f812218f60e00f26ff2d78a97b53e9cb3d4411d6c119`; its last Komodo event records `failed`, not `uncertain`, at 13:59:53.723Z for `6ad7723fe06d5e1f79836d40`.
- Before any source mutation, it reads that exact remote update again, checks RunStackService/Stack identity and `Complete` with a boolean result. If success is unexpectedly reported, it additionally requires the exact target metadata. An unresolved operation stops the driver. It does not retry the old action.
- The new receipt is created with exclusive `wx`, and ties the prior receipt hash/update ID to the new plan. A submitting event precedes every write; failed or uncertain outcomes stop this driver without retries or inferred success.
- All three stacks are checked against their concrete expected mixed baseline: A at release/f56/reclone=true, B at main/old pin/reclone=false, core at main/empty pin/reclone=false. Expected healthy server IDs, no swarm, ordinary inline source, empty clone path, exact existing run directory and `.env` path, one Compose file, no extra dependencies/hooks/wrapper/arguments, empty Git/registry accounts, no automatic update/polling, and no live bind mounts are required. The old four containers must match the prior original identities/image IDs/PIDs/restart counts, remain healthy, and retain exact source digest checks.
- The three public UTF-8 templates are read directly from exact f56 Git blobs. I separately executed the driver's exact regular-file regex against the actual `git ls-tree` output: all three passed `100644`. Raw SHA checks matched the plan. Sizes were A 6145, B 6770 and core 2974 bytes. App effective image pins are checked with the existing Compose parser. The API receives only these unexpanded public templates, never `.env` content or interpolated output.
- Config updates contain exactly `branch`, `commit`, `reclone:false`, and `files_on_host:true`. Full prior/expected config equality is checked in memory before/after. Host mode is read back before `WriteStackFileContents`, preventing entry into its Git-writing branch. Nothing changes credentials, environment values, TLS, isolation or durable storage.
- The only file-write destination is the constant relative `compose.yml` under the same known stack/run-directory. The native writer may create missing parents; the reviewed exact dependency contract is in `/tmp/lingxi-358-host-file-write-fallback-review.md`. No production Git execution is requested by this driver.
- File write returns an exact ID, `WriteStackContents`, matching Stack target and terminal Complete/success:true. The driver re-reads the same update and rechecks all those fields, then explicitly refreshes/validates actual host source bytes. A wrong/missing/failed receipt cannot reach one-off qualification.
- After all three writes, the public host guard checks all sources. Two rounds separated by six seconds execute DB-free metadata on both app nodes and the fixed read-only state command on core-state. Target image digest/ImageId checks use the same qualified operations instance at baseline and before/after each one-off. Original four containers are checked around every stage. Completion is only written after all rounds and final idle/health checks pass.
- There is no StopStack, DeployStack, restart, backup, migration, volume delete, prune or direct host Compose operation in this script. No fallback retries a clone. The public adapter's broader methods are not called by this driver.

## Important operational boundaries

The native file writer is non-atomic and follows symlinks. The driver confines itself to the existing owned paths, normal exact committed blobs and no bind mounts; it is not a general secure-path API. Do not supply alternate paths, reuse the driver against a different baseline, or race a source-writing operation. If actual host path ownership or symlink state is in doubt, resolve that through a read-only check first.

If a write HTTP response times out, an on-host write may already have happened even without a returned update ID. This script correctly stops. The sole executor must resolve the target's update/file state before any further write, rather than changing the receipt filename and rerunning the script. If a partial file exists after a known unsuccessful write, no service deployment is attempted by this script.

A successful file-write receipt is supplemented by actual hashes because Core cache refresh can otherwise retain stale contents or store remote errors. Those host hashes still are not a filesystem lock; single-executor discipline remains required.

The false auto-update flags prevent the native post-write CheckStackForUpdate path from deploying; background digest queries or update-available alerts can still occur. `pull:false` on later one-offs does not override Compose `pull_policy: always`. Git-free therefore does not mean registry-free. Existing strict accelerator credential requirements, including the previously noted host credential-helper/cache evidence boundary, remain in force and were not independently verified in this local review.

This staging result cannot replace a fresh maintenance backup, writer barriers, migration provenance checks, native13 fix-forward rule, target health or final deployment acceptance.

## Local validation and evidence

- `node --check /tmp/lingxi-358-production/prepare-direct-host-sources.mjs`: pass.
- Exact scripted regular-file guard + committed raw SHA on all three source blobs: pass.
- `node --test scripts/schema-upgrade-maintenance.test.mjs scripts/schema-upgrade-host-source.test.mjs`: **30 passed, 0 failed, 0 skipped**. Log: `/tmp/direct-host-review-tests.log`.
- Original-driver local process match: absent. This is not a substitute for the script's fresh remote update/idle checks.

Imported implementation snapshots:

- schema-upgrade-host-source.mjs: `ecdbd23500cba53fd0e891e5dd31b06fa2966115472ab44be872a3d4d71d31aa`.
- schema-upgrade-komodo.mjs: `a378be02f7b856778ec4b68cf42c1de201cd00f6a64f1b254bbe97a3264317aa`.
- schema-upgrade-maintenance.mjs: `fc20a658521d38dba6010ebe386a6c8bf389d9f5150725b3d5b34a3d7f5d42d6`.

No action was denied, pending or uncertain in this review: no production action was submitted. No repository code was modified by this reviewer.
