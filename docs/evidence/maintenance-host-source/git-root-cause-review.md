# Komodo 2.3.3 Git root cause and prepared host-source review

Independent reviewer: `/root/maintenance_resume_review`. Date: 2026-10-20.

Scope: local isolated reproductions, cached sanitized production receipts, and public unauthenticated official source reads. No production API request, host command, configuration change, service operation, credential copy, migration, or deployment was performed by this reviewer. The parent remains the sole production executor. The failure model was recorded before reproduction at `/tmp/lingxi-358-komodo-git-failure-model.md`.

## Finding and decision

The recorded CoreB Git rebase failure is reproducible from a genuinely fresh checkout. Komodo 2.3.3 checks out the configured `main` branch, runs `git pull --rebase --force origin main`, and only after that succeeds resets to the pinned manifest commit. When the local branch has previously been reset to `f56db73dabbaec1e92a421bbad76c239ed8d1ae2` and origin main is `c6c47bddeabb4488f9fe93391f15c695a528260c`, the pull replays the target's merged history and conflicts before the exact-pin reset. All three independent fresh reproductions stop at the same commit, replay position, and five paths as the recorded production CoreB error.

This is not a general claim that an ahead-of-main pin always conflicts. A same-tree linear child of main succeeds; tested historical divergent commits also succeed. The actual history and command sequence matter.

Using the existing fixed release branch `release/production-358-20261020` at the exact target pin avoids that reproduced conflict in clean checkouts: eight repeated clean operations succeeded. However, each operation still performs Git fetch/pull, and switching a previously conflicted checkout can return success while leaving its interrupted rebase journal. Branch selection alone neither proves a clean cache nor removes Git availability from the downtime path.

**Recommended design:** prepare and qualify all required source files online, then use Komodo's public `files_on_host=true` mode with the same existing directories and unchanged environment/security configuration during maintenance. This removes Git checkout/network work from those service operations. It is acceptable only with exact source hashes, supported API contracts, fresh successful host-side qualification, controlled concurrency, and fail-closed verification before operations. It does not make the files immutable and does not eliminate registry, control-plane, or database availability dependencies.

## Reproduction evidence

The evidence directory is `/tmp/lingxi-358-komodo-git-repro`. `README.md` contains repeatable commands that create a new disposable output directory. `commands.json` and `fresh-commands.json` retain every local command, exit code, timing, and safe stdout/stderr. `results.json` and `fresh-results.json` retain before/after HEAD, tree, fork-point, conflict paths and rebase-journal state. `verify_results.py` validates the reported assertions.

The experiment uses Git 2.52.0, local file transport, and existing product objects through read-only alternates. No source refs or history were modified. One synthetic control commit exists only in the fake origin. The production hosts' Git versions and options remain unverified.

| Experiment | Result |
| --- | --- |
| Initial sequence | 16 cases |
| Independent fresh sequence | 18 cases |
| Old pin `5d00ad7e...` behind main, repeated official pull/reset sequence | 3/3 succeed |
| First transition from old pin to target `f56db73d...` | Succeeds |
| Next operation on configured main at target pin | Rebase fails before pin reset |
| Three new main/target checkouts | 3/3 fail identically at replay 2/66 |
| Clean switch to fixed release branch, repeated | 4/4 succeed, exact target HEAD/tree, no journal |
| Fresh clone of fixed release branch, repeated | 4/4 succeed, exact target HEAD/tree, no journal |
| Switch after deliberately interrupted main rebase | Commands succeed but old `.git/rebase-merge` survives |
| Same target tree in a single linear child of main | Succeeds |
| Deliberately altered upstream reflog/fork-point | Can change result; not evidence of production state |
| Failed local clone after removal of its owned fixture checkout | Exit 128, checkout root absent; production network cause not reproduced |

The exact replay failure is:

```text
Rebasing (2/66)
error: could not apply 06c0a1be... test: define durable public activity and historical run recovery failures
```

Conflicted paths:

```text
docs/evidence/issue-215-public/FAILURE-MODEL.md
server/src/__integration__/durable-public-activity.test.ts
server/src/__integration__/public-activity-history.test.ts
server/src/__tests__/durable-public-projection.test.ts
src/features/chat/runtime/public-history-loading.test.ts
```

Fresh failing journal values include `head-name=refs/heads/main`, `onto=c6c47bddeabb4488f9fe93391f15c695a528260c`, `orig-head=f56db73dabbaec1e92a421bbad76c239ed8d1ae2`, `stopped-sha=06c0a1befa6b9516e97ee04b94dd44af8b11d220`, `msgnum=2`, `end=66`.

The target tree is `f094b31bec8b10429213321ec0e7bed0f6611373`. The local linear control is `289ffd0fa2fba31f1e84ad7990c97d7166807cb2`, with that same tree and main as its direct parent.

## Official source contracts

Eight public v2.3.3 sources were downloaded and matched previously inspected local copies byte-for-byte. A ninth public source, the Core query helper, was subsequently downloaded to verify the unavailable-host fallback condition. `official-sources.json` binds their URLs, exact SHA-256, and sizes. The copies are included in the evidence directory.

1. [Git pull](https://github.com/moghtech/komodo/blob/v2.3.3/lib/git/src/pull.rs): path lock; five-second response cache keyed by local checkout path; set origin; fetch all/prune; forced branch checkout; pull with rebase/force; then exact-pin reset. Both success and failure can be reused inside the cache window. A response shortly after configuration change is not independent checkout evidence.
2. [Git clone](https://github.com/moghtech/komodo/blob/v2.3.3/lib/git/src/clone.rs) and [pull-or-clone](https://github.com/moghtech/komodo/blob/v2.3.3/lib/git/src/pull_or_clone.rs): cloning removes the owned checkout root first, clones the branch, then resets the pin. A failed clone can leave the root absent.
3. [Core remote cache](https://github.com/moghtech/komodo/blob/v2.3.3/bin/core/src/stack/remote.rs) and [repository argument path](https://github.com/moghtech/komodo/blob/v2.3.3/client/core/rs/src/entities/mod.rs): the Core cache path consists of provider/repository/branch/commit-or-latest. It excludes stack name. Core uses pull-or-clone, ignoring the stack's `reclone` setting. App A and B with the same source therefore share the Core checkout. A first successful clone/reset followed by a later conflicting pull is consistent with A success and B failure; the exact timing/cache state was not recreated on production.
4. [Periphery stack writer](https://github.com/moghtech/komodo/blob/v2.3.3/bin/periphery/src/stack/write.rs): the inline checkout belongs to the stack's host/name/clone-path. `reclone=true` is honored on every applicable write and can cause repeated full clones. When Git returns unsuccessful logs, the writer returns the root path before appending `run_directory`. Subsequent Compose validation can report a missing root-level Compose file rather than the earlier Git failure.
5. [Periphery Compose APIs](https://github.com/moghtech/komodo/blob/v2.3.3/bin/periphery/src/api/compose.rs): ComposeRun canonicalizes the returned path and can fail with a missing root before producing the original clone logs. Its host-file read operation reads configured dependencies directly from the existing stack/run-directory.
6. [Core stack cache refresh](https://github.com/moghtech/komodo/blob/v2.3.3/bin/core/src/api/write/stack.rs): with `files_on_host=true`, `RefreshStackCache` calls `GetComposeContentsOnHost` instead of Git. If Core cannot resolve the configured server/swarm, the code can carry forward previously successful cached contents. A matching cached hash alone is not proof of a fresh host read.
7. [Core query helper](https://github.com/moghtech/komodo/blob/v2.3.3/bin/core/src/helpers/query.rs): `get_swarm_or_server` checks the server state and errors if it is not `Ok`. Therefore the retained-content fallback includes an unreachable or disabled host, not only a deleted server record.

`auto_pull=true` does not independently deploy on the proposed configuration change. `UpdateStack(files_on_host)` spawns `CheckStackForUpdate` with `skip_auto_update=false`, but the Core implementation returns before its DeployStack branch whenever `auto_update=false` (lines 952–960 in the downloaded source). `auto_pull` is used inside Periphery's explicitly invoked ComposeUp to pull images before deployment (lines 670 onward). This permits the existing `auto_pull=true` to remain unchanged during online preparation. Image digest checks/alerts can still occur, and an eventual explicit deployment can still pull from the registry.

The supporting existing Core execute source at `/tmp/issue216-komodo233-source/core-execute-stack.rs` also shows that `maybe_pull_stack` returns early in host-file mode. The stack entity source at `/tmp/issue216-komodo233-source/client-entity-stack.rs` defines tracked dependency collection.

## Other production failures remain distinct

The long Periphery metadata operation ended with a missing checkout root after a prolonged full clone. The retained error is consistent with clone failure before Compose, but it does not establish the underlying transport, authentication, storage, or Git cause. The local failed-clone fixture demonstrates only the root-removal/failure shape.

A read-only core-state oneoff also failed once with a missing root-level `compose.yml` despite its main/no-pin configuration. Its earlier Git cause was masked and remains unknown. It must not be described as the reproduced main/target rebase conflict.

The latest parent-reported production state is the restored source release 3.5.6/native schema 12/product migration 46, with four healthy original services and source configuration restored. This report does not claim the 3.5.8/native 13/product 48 release ran or that production host-file mode has already been qualified.

## Host-file-mode acceptance conditions

The public mode is a narrower way to keep already verified files available during maintenance than recurring Git checkout. The following conditions are required:

1. **Same physical path.** Inline mode resolves stack directory/name/clone-path/run-directory; host mode resolves stack directory/name/run-directory. Exact empty `clone_path`, unchanged stack name, host, and run-directory make these paths identical. Reject linked repositories, inline content, swarm indirection, extra Compose paths, additional dependencies or hooks unless explicitly modeled and verified.
2. **Online preparation first.** All three stacks—app A, app B and core-state—must have verified files before stopping anything. Use the fixed release branch and exact pin during preparation, inspect terminal receipts, and establish fresh successful host-side DB-free metadata on both app nodes and read-only state on core-state after freezing. Repeated online Git preparation should extend beyond the five-second cache window. Do not assume a successful branch switch removed a stale rebase journal.
3. **Hash actual raw files.** Compare each host's returned raw Compose bytes to `git show <exact-pin>:<exact-path>`. Retain hashes, never secret-bearing content. Do not infer content provenance from the branch/pin fields in host mode; those fields no longer select the files used by Compose.
4. **Freshness and concurrency.** Require a healthy expected host, a completed cache refresh with no missing files or remote errors, exact before/after configuration, idle stack actions, no concurrent rollout/resource sync, and successful host-side operations. A before/after `ListServers` check narrows the risk but cannot by itself prove the refresh did not take the cached-content fallback between the checks. The actual operation is another host-availability check; evidence should state this limitation.
5. **Environment and dependencies.** The existing environment writer still writes the same generated `.env` in the same directory. Preserve environment, interpolation, secret references, env-file path, deployment policies, arguments, hooks and credentials. Tracked dependencies include Compose and configured additional env/config files; the default generated `.env` is not automatically a separately tracked source artifact. Never publish its contents or use secret contents as evidence.
6. **Operational guards.** Verify source identity before pull, metadata, read-only state, stop, migrate and deploy, and revalidate the exact runtime/image/schema metadata immediately before migration. Preserve all original drain, zero-writer, backup, target-state, ordered Web/Worker deployment and actual-health barriers. No retries or old-service starts when a mutating operation's outcome remains unknown.
7. **External dependencies remain.** Host mode removes the Git checkout path, not Docker registry login/pulls, image availability, control-plane communication, `.env` writes, database access or service startup. Qualify images and these operations online; retain existing timeouts and uncertainty handling.
8. **Exit mode deliberately.** Restoring Git mode must use a compatible verified source branch/pin and online checks. Reverting a boolean is not proof the old checkout is clean. Retain the exact four-service/DB-state receipts and do not turn an unverified Git refresh into an automatic deployment.

Raw target Compose SHA-256, also machine-readable in `compose-hashes.json`:

| Stack | Target raw Compose SHA-256 |
| --- | --- |
| lingxiloop-app-a | `4ad4d738a8f41d549412a71c4de8c78e5fb3f2c5365be86d5fa892db8877b050` |
| lingxiloop-app-b | `145ded6c585329317b54c2cca24e80870ab151d870a7c749bd2724dd852c5a26` |
| lingxiloop-core-state | `dda3dd16ff30968905f2083d271a28d12e1519f713ce46a7fead19a02ce82dab` |

Core-state's raw Compose is byte-identical at current main and target; both application Compose files differ. These source hashes are preparation expectations, not evidence of production host contents.

## Limits and handoff

The local receipt verifier passes 16 initial and 18 independent cases. Source-derived host-mode contracts are verified against Komodo 2.3.3; the maintenance adapter implementation and its tests require a separate review. Production online preparation, actual host raw-file hashes, real provider/registry behavior, and new maintenance success remain the sole executor's pending checks.

No production permission request was needed or attempted by this reviewer. No action was denied or left with an uncertain production outcome in this review, because no production operation was submitted.
