# Independent host maintenance plan and postflight review

Reviewer: `/root/maintenance_resume_review`, 2026-10-20.

Scope: local-only review of the sealed plan, cached preparation/terminal receipts, exact public maintenance code, and five private postflight scripts. No production API request, service action, migration, credential access, or code modification was performed. Only this review artifact was written.

## Decision

**No unresolved P1/P2 findings in the reviewed final state.** The execution preconditions are consistent with the qualified source-to-target transition and the newly completed host-source preparation. Two initial acceptance omissions were reported and fixed before this final review: final acceptance now requires both the postflight terminal collector and the actual public asset checks.

The parent reports maintenance has started in session 11110, writing the exclusive `maintenance-host-execution.json`. This report does not claim that maintenance, migration, deployment, or final acceptance has completed. It does not direct a second execution or a retry.

## Exact reviewed identities

- Public operations worktree: `/workspace/LingxiLoop-maintenance-host-source`, clean at `16313a843aa824050e7cfb88f66db80193a88492` when read.
- Cached CI receipt: run `39436323154`, exact head `16313a843aa824050e7cfb88f66db80193a88492`, completed/success; publish/deploy/update-manifests/rollout skipped. This was checked from the local saved GitHub readback, not independently queried over the network.
- Plan: `/tmp/lingxi-358-production/maintenance-host-plan.json`.
- Canonical plan hash: `67db9eb7800edda238fb8e9a72dbcb28793f50314a92a731c361874842ac0849`.
- Source: `ac9069460e99a20fac7f2c3de87c60f2bec66924`, runtime 3.5.6, native schema 12, protocol 11, product migration 46.
- Target application: `d1075e35e16721979b484c2d9e33eeb56468ce9d`, runtime 3.5.8, native schema 13, protocol 11, product migration 48.
- Manifest pin: `f56db73dabbaec1e92a421bbad76c239ed8d1ae2`.
- Source branch: `release/production-358-20261020`, native host-file mode on all three stacks.
- Target image index: `sha256:697d5a3e3d34629e603c120cd068abde3a2add611f583d5444d77a947887bf69`.
- Target container image/config ID checked by postflight: `sha256:019d5728f0ef708fe9a642eaf1effd2c12699cdb303e2206e11b55e542fb2c4b`.

The application qualification stored in the plan remains the successful d107 application CI run `39412540194`. The newer 16313a operations CI is separately identified above; it is not substituted for the application/image qualification.

## Preparation evidence independently checked

The saved preparation completed at `2026-10-20T14:08:31.272Z`. The terminal collector completed at `2026-10-20T14:12:18.180Z`.

Local assertions verified:

- Preparation and terminal receipts use the exact same sealed plan hash.
- The terminal receipt's preparation SHA-256 matches the actual saved preparation bytes.
- There are exactly nine distinct terminal update IDs; they equal the IDs recorded by preparation, excluding its separately checked earlier action.
- Each of the three stacks has one WriteStackContents and two RunStackService terminal receipts.
- All nine recorded statuses are Complete/success=true and have valid start/end ordering.
- Exact target Stack IDs are app A `6aa8a411b35d27bdd4e12aef`, app B `6aa8a414b35d27bdd4e12af1`, core-state `6aa8a3e8b35d27bdd4e12ae0`.
- The preparation recorded four original healthy, running source containers, stable identities, no restarts, and final `originalContainersUnchanged=true`.
- Saved host-source hash proofs match all three hashes derived from the exact manifest pin.

The nine recorded update IDs:

| Stack | WriteStackContents | RunStackService round 1 | RunStackService round 2 |
| --- | --- | --- | --- |
| app A | `6ad774ede06d5e1f79836dca` | `6ad7754be06d5e1f79836de4` | `6ad77594e06d5e1f79836df6` |
| app B | `6ad77507e06d5e1f79836dd2` | `6ad77565e06d5e1f79836de8` | `6ad775ace06d5e1f79836dfa` |
| core-state | `6ad77520e06d5e1f79836dda` | `6ad7757ce06d5e1f79836def` | `6ad775c4e06d5e1f79836e01` |

Recorded terminal durations are 95–102 ms for file writes, 6.717–7.961 seconds for app metadata operations, and 673/681 ms for core-state reads. These are observed operation durations, not a prediction for deployment.

The reviewed collector code validates the full target metadata fields and source SQL migration inventory before emitting the sanitized summaries. Raw production logs are intentionally absent from these artifacts; this reviewer validated the sanitized receipt chain and collector implementation without reissuing production reads. No new service stop, deployment or migration is represented by these nine preparation receipts.

## Execution safety gates

The reviewer ran `validatePlan()` locally against the actual saved plan and independently recomputed its seal; both passed. This covers exact formal package provenance, contiguous migration checksums, committed effective image pins, the host-source hashes, and the backup descriptor.

The new backup uses:

- Attempt `production-358-host-20261020`.
- Directory `/var/lib/postgresql/data/memory-upgrade-backups/ac9069460e99a20fac7f2c3de87c60f2bec66924/production-358-host-20261020`.
- Isolated verification database `memory_verify_ac9069460e99_f3691de63589a89b`.
- Command hash `79774a5de0c401301b63fd7f4f95747d4b5e2f5f38fd67940a8e04db93cba0b0`.

The attempt, directory and command hash were explicitly compared with the successful backup recorded in old maintenance attempt 3; all differ. The old attempt was `production-358-20261020-1201`. The current engine invokes the backup only after draining all four services and establishing its repeated zero-writer barriers. A previous success receipt is not supplied as its backup result.

Before the first stop, the engine checks idle ownership, exact frozen source files/configuration, actual source container and image identities, source database provenance, cached target images on both hosts, and both nodes' DB-free target metadata. It does not submit an explicit PullStack.

Workers stop before Web services. Each stop requires a known successful terminal receipt and exact stopped-container identity. Two separated barriers require zero active work, session, attempts, capture, outbox, other clients and prepared transactions. Backup restoration/provenance/count checks must succeed. Source state, barriers, both target metadata checks, and image checks run again before migration.

Migration executes target metadata checks before importing migration code. After migration, exact target runtime/native schema/product inventory is required. The recovery order is Web A, Web B, Worker A, Worker B, with actual health and expected image identity required at each stage.

An unknown submitted operation stops progression without automatic retry or automatic source restart. A partial schema/product upgrade crosses the existing fix-forward boundary; old 3.5.6 services are not automatically restarted against native 13 or migration 47+. Current registry dependencies remain: removing explicit PullStack does not override Compose pull policy or explicit deployment auto-pull.

At the local prelaunch check, the new execution output and all four new postflight/acceptance outputs were absent. The parent subsequently started the single authorized execution with exclusive output creation.

## Postflight and acceptance

The five scripts were read completely and passed `node --check` locally:

1. `read-production-host-after.mjs` performs read-only inventory and public HTTPS checks. It records all four container identities/images/source declarations, running/health/restart/OOM state, security policy fields, exact worker command/entrypoint/readyz configuration, three host states, and Web/public health/version responses. Raw configs, environment values and credentials are not emitted.
2. `read-host-target-state.mjs` uses the reviewed public adapter in host-source mode for a fresh read-only SQL oneoff. It records its terminal update and checks native 13/runtime 3.5.8/product 48; the final verifier additionally checks protocol, schema hash and the complete migration inventory.
3. `check-host-public-assets.mjs` checks the actual public index plus discovered JS/CSS entrypoints against the audited d107 image inventory, using decoded response byte SHA-256 and expected content types. It saves a separate result and does not claim authenticated business testing.
4. `collect-host-update-receipts.mjs` collects the current execution and target-state update IDs, requires four stop and four deploy receipts, binds the fresh backup attempt/command hash, and verifies every collected update's exact ID, Stack target, operation, Complete status and success=true. It binds its output to the current execution file's SHA-256.
5. `verify-host-postflight.mjs` binds the preparation chain, fresh backup attempt and command, final maintenance completion, actual target image/source, four service identities, zero restart counts, unchanged policy fields, full target database provenance, public version/health and worker startup checks.

Two initial P2 acceptance gaps were resolved in the final verifier:

- It previously did not depend on the public asset result. It now requires `public-host-assets-after.json`, `verified=true`, at least three actual requests, status 200, and audited-image matches.
- It previously did not depend on the terminal collector. It now requires `host-komodo-terminal-receipts.json`, exact plan and execution-byte hash binding, at least 19 recorded updates, and all Complete/success=true. The collector itself enforces the critical four stop/four deployment inventory and exact targets.

The final verifier also explicitly checks `backup.attempt === plan.backup.attempt`. Run the readers, asset check and terminal collector before the final acceptance verifier. Missing artifacts fail closed rather than silently marking acceptance complete.

## Evidence hashes

All paths below are beneath `/tmp/lingxi-358-production`, unless noted otherwise.

| Artifact | SHA-256 |
| --- | --- |
| maintenance-host-plan.json | `7ea3bb53b0e23c0382512193932f18be58d472dc01d14dc588b40cab97d0d9eb` |
| online-direct-host-preparation.json | `feba715e52344e08642b4b01f29358655d8c9ec0ca6ecf88f3bfa97ff73403c7` |
| online-direct-host-terminal-receipts.json | `e59574a8496823d113478f792d9677f8013543ff454b84983c6808536e4b307b` |
| host-source-cached-image-ci-summary.json | `89964f6d9913876d2f05378cae6fee3151bc3422d282b39a6c014cc8b19c50af` |
| read-production-host-after.mjs | `e0384aba74138ef470c783a72f88480315b56d8a3282f57d43a5fbc59d5c39c9` |
| read-host-target-state.mjs | `bf21fe0982e2c923b418027afda21e3007e50bb4ee74244feb6fc826c81874a7` |
| verify-host-postflight.mjs, final | `7f2970115c5f27bccd67c8d80a86b6eb5f6b7d0d670e6ba5b9f70db496e4b46c` |
| check-host-public-assets.mjs | `3bc9ef599b7f6f3b616d1f72e836cdfd423de3dc9b23b1bb38d3d0ee4288cef6` |
| collect-host-update-receipts.mjs | `152eb91b537cebdedc4902e508ad23db58b993e5738852ebba8b631d2f5b5978` |
| public scripts/schema-upgrade-maintenance.mjs | `3ffa259a8468c6dccd64906f9e6cee75f74562bfa551ef0c8e3880535ce27540` |
| public scripts/schema-upgrade-komodo.mjs | `a378be02f7b856778ec4b68cf42c1de201cd00f6a64f1b254bbe97a3264317aa` |
| public scripts/schema-upgrade-host-source.mjs | `ecdbd23500cba53fd0e891e5dd31b06fa2966115472ab44be872a3d4d71d31aa` |

## Remaining limits

Actual maintenance completion and all postflight outputs remain pending at this review boundary. The saved preparation is evidence of completed online preparation, not deployment acceptance.

Authenticated business smoke remains unrun because no existing authorized smoke cookie/company ID is available; no credential was created or copied. Worker startup isolation is correctly labelled as inference from exact qualified source, production command and healthy native readyz, not a complete isolation or fault-injection matrix. Host-cache freshness and registry limitations described in the earlier review remain.

No action was denied, no permission was requested, and no production action submitted by this reviewer has an uncertain outcome.
