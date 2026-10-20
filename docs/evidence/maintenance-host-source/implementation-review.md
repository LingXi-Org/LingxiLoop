# Independent host-source implementation and online preparation review

Reviewer `/root/maintenance_resume_review`, 2026-10-20. Scope: local code and public Komodo 2.3.3 source review, local tests, offline sealed-plan validation. No production requests or mutations were performed by this reviewer.

## Decision

No unresolved P1/P2 findings in the reviewed revision. The sole executor may run the concrete **online preparation only** script with the existing authority. This decision does not assert production preparation has passed or authorize skipping its receipts before downtime.

Reviewed private preparation script:

- Path: `/tmp/lingxi-358-production/prepare-host-sources.mjs`
- Final SHA-256: `469b5a9d91cb102cc31a9422c2905ca12aa74056418a04dd8546447cbb96134b`
- Earlier reviewed revision, superseded by the additional guards below: `7dccd3d6a88db8d7f3cb2653adce550083619d17baf734800a81358fa5eefeb2`
- Plan path: `/tmp/lingxi-358-production/maintenance-host-plan.json`
- Canonical plan hash: `67db9eb7800edda238fb8e9a72dbcb28793f50314a92a731c361874842ac0849`
- Plan file SHA-256: `7ea3bb53b0e23c0382512193932f18be58d472dc01d14dc588b40cab97d0d9eb`
- Fresh backup attempt: `production-358-host-20261020`; the preparation script does not execute the backup.
- Qualified application source: `d1075e35e16721979b484c2d9e33eeb56468ce9d`
- Exact manifest pin: `f56db73dabbaec1e92a421bbad76c239ed8d1ae2`
- Fixed release branch: `release/production-358-20261020`

## Reviewed behavior

The preparation script validates the plan offline, resolves the existing release branch exactly, reserves an exclusive private receipt, and serializes all actions. It captures the existing four healthy source containers and compares the same container/image/state identities throughout.

Before preparing each owned checkout, the script checks exact source configuration, expected healthy server identity, no swarm, empty clone path, unchanged run-directory and Compose/env paths, no extra dependencies or hooks, and disabled automatic deployment. It now rejects every bind mount on current services of those stacks. Only the three existing owned inline checkouts are subject to the Komodo reclone behavior; application/database named volumes remain outside that checkout scope.

Its only configuration keys are branch, commit, reclone and files_on_host. Before and after every write, it compares the complete configuration in memory and retains only field names and fixed evidence in the receipt. It does not copy environment values or credentials. A lost UpdateStack HTTP response triggers read-only verification, never a retry. Exact changed-field readback is required before progressing; HTTP failures stop the script.

The final revision also requires empty git_account and registry_account on all three stacks before any configuration write. It reuses one qualified operations instance to inspect the exact target image on both application hosts at baseline and before/after every oneoff, checking the qualified repository digest and retaining the initial image ID for subsequent equality checks. These are additional read-only guards; they do not add API operations that change services or configuration. The final script passed an additional `node --check` and static delta review.

For each stack, it performs one cold online preparation, sets reclone=false, and performs two warm checks separated by six seconds. The application operations read package/schema metadata without importing application migration code; core-state uses the existing read-only SQL state query. All service-operation receipts use the existing strict public transport and require their exact known update to reach Complete/success. The script then changes only files_on_host, verifies raw Compose hashes, and performs two rounds of real host-mode operations on all three stacks. It contains no StopStack, DeployStack, migration, or backup call. Any caught failure stops without retry or automatic recovery.

The public maintenance change requires plan format 2 and a host-source descriptor derived from exact committed Compose bytes. Its public adapter refreshes and checks the relevant host source before pull, metadata, read-only state, stop, migrate and deploy. It verifies both app nodes' DB-free metadata before the first stop and again after the backup. Original drain, zero-writer, backup, migration-state, ordered Web A/B then Worker A/B, actual health, and uncertain-outcome gates remain in place.

The final public validator additionally requires both git_account and registry_account to be empty on every verification, including after freezing. This is a stricter rejection condition and adds no credential lookup, configuration write or execution path. The reviewer removed precisely those two new conjunctions from the final module in memory and obtained the previous reviewed SHA-256 `5f8d1c074ecd2f20e0b03235b583542f8884770ea3f8a3579f859233655b16d6`, proving that this module delta contains no other change. The private driver remains exactly `469b5a9d91cb102cc31a9422c2905ca12aa74056418a04dd8546447cbb96134b`.

The native backup callback remains the existing standalone public RunStackService implementation. The maintenance engine checks all three frozen sources through assertIdle immediately before invoking that callback; the backup method itself does not independently implement host-source validation.

## Findings resolved before this decision

1. **P2: incomplete live bind-mount overlap check.** The initial private script rejected mount sources beneath the owned checkout but allowed an ancestor bind such as `/etc/komodo/stacks`. Removing the checkout could affect that mounted ancestor. The reviewed revision conservatively rejects all bind mounts on current services of the three stacks, closing both ancestor and descendant cases for this scope.
2. **P2: explicit preparation host binding.** The initial scope check used the expected host for inspection without directly comparing the stack's configured server. The reviewed revision compares the unique healthy expected server ID and requires empty swarm configuration before cold preparation.
3. The public host validator now requires a valid 24-hex stack ID, rather than accepting equality between two missing IDs.

## Official auto-pull and cache semantics

Komodo 2.3.3 UpdateStack(files_on_host) can launch a background CheckStackForUpdate, but its auto-deployment branch is bypassed whenever auto_update=false. The existing auto_pull=true only controls registry pulls inside an explicit ComposeUp; it is not an independent deployment trigger. It can remain unchanged. Digest checks and update alerts may still occur.

Host mode removes Git from the subsequent Periphery stack writer and Core cache-refresh path. It still writes the existing generated .env through the normal writer. It does not remove registry pulls, control-plane availability, database access, or container startup failures. In particular, a RunStackService request with pull=false does not itself override Compose `pull_policy: always`; oneoff operations can still depend on the existing registry/mirror. Pre/post image inspections detect drift but do not prove the external request cannot fail.

Core's RefreshStackCache can preserve prior contents when the server is temporarily not Ok. The adapter checks healthy host identity before and after, rejects missing/errored contents, and compares exact raw hashes. Those checks plus the online real host operations provide practical evidence under the sole-executor constraint, but they are not an atomic attestation of filesystem immutability. A host state change wholly inside the refresh window is a documented residual API limitation. No unknown cache field or private API is fabricated to hide this limitation.

## Independent validation

Executed locally, all successful:

- `node --check /tmp/lingxi-358-production/prepare-host-sources.mjs`
- `validatePlan()` against the exact saved plan above, including target package provenance, committed manifests, host hashes, backup descriptor and plan seal.
- `node --test scripts/schema-upgrade-host-source.test.mjs scripts/schema-upgrade-maintenance.test.mjs`: **30 passed, 0 failed** after the stack-ID revision.
- After the narrower empty-account validator change, `node --test scripts/schema-upgrade-host-source.test.mjs`: **7 passed, 0 failed**. Independent receipt: `/tmp/lingxi-358-host-source-mirror-review-test.log`. The earlier 34 Git reproduction cases were not rerun.
- `git diff --check` for the reviewed public changes.

The parent reported a broader 54-test run. The reviewer inspected the retained mirror red receipt (6 passed, 1 failed with missing expected rejection) and the final green receipt (54 passed, 0 failed). These are parent-owned runs, distinct from the reviewer's earlier 30-test and final 7-test runs.

Public worktree: `/workspace/LingxiLoop-maintenance-host-source`, branch `fix/maintenance-host-source`. Reviewed file SHA-256:

| File | SHA-256 |
| --- | --- |
| scripts/schema-upgrade-host-source.mjs | `ecdbd23500cba53fd0e891e5dd31b06fa2966115472ab44be872a3d4d71d31aa` |
| scripts/schema-upgrade-komodo.mjs | `a378be02f7b856778ec4b68cf42c1de201cd00f6a64f1b254bbe97a3264317aa` |
| scripts/schema-upgrade-maintenance.mjs | `fc20a658521d38dba6010ebe386a6c8bf389d9f5150725b3d5b34a3d7f5d42d6` |
| scripts/schema-upgrade-host-source.test.mjs | `ad686544e02daf18510e156dfa7ac9cf871409d62760529d63c05f85929ea94f` |
| scripts/schema-upgrade-maintenance.test.mjs | `90b4436d9fef3bc19d894fa1e454949932cedb120c3311030e1ed65aeacec4ec` |
| .github/workflows/ci.yml | `5aa7c03c30de5d4ee28ac604fd629ad609407e73acd6b841a1b2c10f28ef9a2a` |
| docs/evidence/maintenance-host-source/failure-model.md | `125fed948e3fa3e5229bca16c4618813a38a9ccd5b90b3002135359a7ed7ece7` |

## Remaining acceptance

The preparation script must produce its own complete receipt, every oneoff must reach a known successful terminal state, all three stacks must pass their cold/warm/host-mode checks, and all original containers must remain unchanged and healthy before a new maintenance attempt. Real online transport/provider behavior was not simulated here. A later source edit requires review of that delta. No migration or deployment success is claimed by this report.

No action was denied, no approval request was made, and this reviewer has no uncertain production operation because it submitted none.
