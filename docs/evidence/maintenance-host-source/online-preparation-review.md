# Independent review: online host-source preparation

Reviewer: `/root/host_preparation_review`. Date: 2026-10-20. Scope: local read-only code/evidence inspection and local existing tests only. No production request, service action, configuration change, credential access/copy, migration, backup or deployment was performed by this reviewer. The sole production executor is the parent.

## Result

**No P1/P2 finding blocks executing the reviewed online preparation script.** No additional code correction is required for that narrow online operation at the reviewed snapshot. This is not a claim that production preparation succeeded or permission to skip its terminal-receipt, actual-host and repeated-preflight gates before downtime.

The script performs only serial source configuration changes (`branch`, `commit`, `reclone`, `files_on_host`), supported cache refreshes, and bounded DB-free metadata / read-only SQL one-offs. It contains no call to StopStack, DeployStack, migration, backup, restart, prune, volume removal or credential/security modification. The original four source containers must remain running, healthy, on their original immutable image, with identical identities, restart counts and state before/after its steps. The final script also reuses one qualified operations instance to verify both target image digests and stable image IDs at baseline and before/after every one-off.

The new plan validates offline with:

- Plan hash `67db9eb7800edda238fb8e9a72dbcb28793f50314a92a731c361874842ac0849`.
- Format 2; source `ac9069460e99a20fac7f2c3de87c60f2bec66924`; target `d1075e35e16721979b484c2d9e33eeb56468ce9d`.
- Exact manifest pin `f56db73dabbaec1e92a421bbad76c239ed8d1ae2` on fixed release branch `release/production-358-20261020`.
- Three committed raw Compose hashes derived from Git.
- New backup attempt `production-358-host-20261020`; no reuse of the prior drained snapshot. This review did not execute that backup.

## Evidence and safety checks

1. The initial loop verifies each stack's expected active host and no swarm, inline Git source, empty clone path, exact existing run directory, single Compose file, same `.env` path, no extra dependencies/hooks/wrapper, auto-update disabled and polling disabled. All current stack service mounts are read and cold preparation refuses any live bind mount. This confines the native clean-clone operation to the existing owned checkout, with application durable state in named volumes untouched.
2. Every partial write first rechecks idle state, healthy unchanged original containers, and exact full in-memory prior configuration. It reads back the exact full expected configuration after writing. It never serializes environments, credentials or full API replies. HTTP denials are recorded, not retried. A network-uncertain write is resolved only by readback; a mismatch stops progression.
3. The preparation cold path sets the fixed branch/pin and `reclone=true` once per stack, then runs the exact target metadata (app A/B) or fixed source SQL (core-state). It restores `reclone=false` after terminal success. Two warm checks extend beyond Komodo's five-second cache window. There is no automatic fallback to main or second clone on failure.
4. Only after all Git-backed checks pass does the script change each existing stack to native host-file mode. The public verifier refreshes actual host content, rejects missing files/errors/duplicates, checks before/after config and host availability, and compares raw bytes to exact committed hashes. Two complete host-mode rounds then execute real metadata on both app hosts and read-only SQL on core-state while preserving the original four containers.
5. The official Komodo 2.3.3 implementation confirms host-file mode selects the same stack/run-directory when `clone_path` is empty, writes the same generated `.env`, and bypasses Git. `UpdateStack(files_on_host)` invokes an asynchronous update check, but `!auto_update` exits before DeployStack. `auto_pull=true` does not by itself start deployment from that write.
6. `RunStackService` uses the fixed `db-migrate` / `postgres` service with no dependencies or ports and no detached mode. Metadata overrides the service command with a public runtime resource reader; it imports no product migration. State overrides the entrypoint to a bounded read-only `psql` transaction, so no second PostgreSQL server starts. Transport accepts only the exact operation/stack/update identity and terminal success.
7. The private receipt is created exclusively (`wx`). Known action IDs are persisted and polled; a timeout or failed terminal result stops the script and does not retry. The script does not start automatic recovery while an action remains uncertain. A later executor must inspect that known update before further writes, and must not rerun this script by merely changing the output filename.

## Final script additions and credential boundary

The final inspected driver SHA-256 is `469b5a9d91cb102cc31a9422c2905ca12aa74056418a04dd8546447cbb96134b`. Its new `git_account === '' && registry_account === ''` check is in the initial all-stack validation loop, before any source configuration change or one-off. It preserves the registered accelerator route and changes no TLS or security configuration.

Additional unauthenticated official-source checks confirm that Core `git_token` returns `None` for an empty username, Periphery has no Git token when RepoExecutionArgs.account is absent, and `maybe_login_registry` calls docker_login only when registry provider and account are both nonempty. Thus the final script does not select a Komodo Git/registry credential for its empty-account path. These sources are cached at `/tmp/host-review-core-helpers.rs`, `/tmp/host-review-periphery-helpers.rs` and `/tmp/host-review-stack-helpers.rs`, corresponding to official v2.3.3 `bin/core/src/helpers/mod.rs`, `bin/periphery/src/helpers.rs`, and `bin/periphery/src/stack/mod.rs`.

This proves the Komodo configuration path, **not the absence of preexisting Docker/Git credentials or global credential helpers on the hosts**. This reviewer made no production credential-store inspection. Under the parent's new strict no-credential-to-accelerator condition, the sole executor should retain a read-only boolean-only check of any existing host credential/helper routing for that domain before claiming the host interaction is fully anonymous. No credential content should be printed/copied, and this review does not authorize a credential/security change.

## Remaining limits (not source-preparation code defects)

- `files_on_host` is a native source selection mode, not a filesystem immutability primitive. Single-executor discipline and repeated source checks remain necessary; before/after reads cannot eliminate every concurrent host-file mutation race.
- Core can retain matching cache contents if its server lookup fails inside refresh. Before/after healthy-host checks narrow this, while the fresh successful host-side one-offs supply the additional production qualification. Do not describe a cached hash alone as proof of a successful host read.
- **Komodo ComposeRun `pull:false` skips its explicit `compose pull`; it does not add `--pull never` to `compose run`.** The qualified Compose's `pull_policy: always` may still access the registry. This change removes Git from host-mode preparation, not registry login/pull, Docker or other network dependencies. The failure model already records this risk; no network-free maintenance claim is justified.
- A cold clone may exceed the transport's seven-minute one-off wait. That remains an uncertain operation, but old services remain online; wait for the saved update's true terminal state instead of duplicating it. No test here proves production network latency or live provider behavior.
- Future maintenance must retain its fresh backup, zero-writer barriers, exact image/provenance checks and native13 fix-forward rule. Reverting host mode after release also needs a compatible exact source and online verification.

## Verification performed

`node --test scripts/production-rag-contract.test.mjs scripts/release-smoke.test.mjs scripts/schema-upgrade-maintenance.test.mjs scripts/schema-upgrade-host-source.test.mjs`: **54 passed, 0 failed, 0 skipped**. Raw log: `/tmp/host-preparation-review-tests.log`.

`validatePlan()` on the saved host plan: passed, no API/network operation. The existing local formal runtime dependency was read; no dependency installation occurred.

Sources examined: repository AGENTS.md and Operate Komodo Production skill; `/tmp/lingxi-358-komodo-git-root-cause-review.md`; official cached Komodo v2.3.3 `core-execute-stack.rs`, `periphery-compose.rs`, `periphery-stack-write.rs`, `clone.rs`, and Core write/stack.rs. The reviewed official functions match the already retained exact-version source evidence.

No action was denied, pending or uncertain in this review because this reviewer submitted no production operation.

## Reviewed file SHA-256

- `/tmp/lingxi-358-production/prepare-host-sources.mjs`: `469b5a9d91cb102cc31a9422c2905ca12aa74056418a04dd8546447cbb96134b`
- `/tmp/lingxi-358-production/maintenance-host-plan.json`: `7ea3bb53b0e23c0382512193932f18be58d472dc01d14dc588b40cab97d0d9eb`
- `/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-host-source.mjs`: `5f8d1c074ecd2f20e0b03235b583542f8884770ea3f8a3579f859233655b16d6`
- `/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-komodo.mjs`: `a378be02f7b856778ec4b68cf42c1de201cd00f6a64f1b254bbe97a3264317aa`
- `/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-maintenance.mjs`: `fc20a658521d38dba6010ebe386a6c8bf389d9f5150725b3d5b34a3d7f5d42d6`
