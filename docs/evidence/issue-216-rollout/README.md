# Native schema13 release boundary

This is an independently reviewable implementation checkpoint, not a production receipt. Development made **zero production/provider requests**. Root remains the sole integrator/operator. The current source is not assumed to remain2ea8615/3.5.6; re-pin actual source/image/provenance after any intervening release or recovery.

The failure model was committed before implementation. `scripts/schema-upgrade-maintenance.mjs` owns a narrow12/46→13/47-or48 state machine; `schema-upgrade-komodo.mjs` supplies the fixed Komodo2.3.3 transport and metadata-only queries. The reviewed backup helper is imported unchanged from its public exports at upstream commit1b0945b226 (with its four prerequisite commits). Its current supported formal source remains3.5.6/schema12/product46. If the source becomes formally published3.5.7, its exact baseline/integrity/schema metadata must be separately reviewed and updated; this checkpoint refuses that source until then. There is no broad version override.

## Ordinary release gate

`trigger-komodo-rollout.mjs` now checks target image public package metadata and real database provenance **before** resource synchronization, historical forum migration handling, webhook or StopStack. A native12→13 change fails closed. A consistent13→13 ordinary UI release uses the existing rolling procedure. A temporary maintenance commit pin, running rollout procedure or existing running/retrying db-migrate also blocks ordinary rollout. No drain flag is placed in Compose, resource environments or CI secrets.

The gate uses two no-dependency/no-port one-off services: a DB-free target metadata command and a fixed read-only SQL query. Metadata checks the image's `LINGXILOOP_COMMIT_SHA` against both checked-out Compose pins. SQL uses `BEGIN READ ONLY`,5-second statement/1-second lock/10-second idle-transaction limits and requires full activity visibility. These are real Komodo execute operations when an operator/CI eventually invokes the trigger; no production invocation was made here.

Both the ordinary gate and offline maintenance planning require the local Docker Compose CLI. They resolve each manifest through `docker compose config` with stdin, an empty env file, no interpolation, no service env-file/path resolution and a PATH-only child environment. No daemon action is invoked. The parser has a10-second/1MiB output bound and returns only the immutable image tag shared by the effective `db-migrate`, `lingxiloop` and `worker` services. Repeated equal declarations are valid; a stale Worker override, missing service, variable/mutable tag or mixed A/B target is rejected before service actions. Raw rendered configuration/stderr never enters errors. Offline planning applies the same check to both files read from exact manifest commitD.

Manual calls to the stock procedure bypass this repository entrypoint. They are **not** a supported schema-upgrade path. The stock procedure only stops Workers; both Web processes have background writers. Do not invoke it during this maintenance.

## Exact preparation and temporary pin

1. Qualify the exact formal target package, all four manifest/lock references, target commitT and successful exact-head CI. Record its immutable image digest; pullability is not inferred from publication. The installed target package's public `releaseVersions`, `packageResources().schema` hash and package version must match the plan. A candidate merely labelled3.5.6/schema13 fails offline planning against formal3.5.6/schema12.
2. Publish T without automatic deployment: the integrating commit must contain `[skip deploy]`, or use the existing `publish_only` manual workflow. Publish-only does not prevent a later ordinary main push. Root serializes release jobs, waits for any already-running procedure and maintains the exclusive maintenance window.
3. Prepare manifest commitD, also containing `[skip deploy]`, which pins both App Compose files to the immutableT tag. No new infrastructure/image proxy/credential/security settings. The plan verifies D's two manifests and suppression marker locally.
4. Read each actual App stack `_id.$oid` and existing source settings. Apply only the following **partial** write per App using the current authorized injected API headers:

   `POST /write/UpdateStack` body `{"id":"<actual24hexAppStackID>","config":{"commit":"<D40hex>"}}`.

   `releasePinPayload(actualStackId,D)` produces precisely this whitelist payload. Do not copy the rest of `config` or its environment. The API can return successful empty content: a body JSON parse failure is not evidence of rejection. Read `GetStack {"stack":"lingxiloop-app-a"}`/B and verify `config.commit===D`, unchanged repo/branch/run_directory and correct existing server binding before deciding whether any retry is justified. An uncertain write is never blindly repeated.
5. The helper requires both actual App commits equalD; correct repo `LingXi-Org/LingxiLoop`, branch `main`, run directory and shanghai-a/b server identity; automatic update disabled; no other active stack/procedure/migration operation. This closes the per-action branch-refresh race: Komodo's Pull/Run/Deploy resolves the configured commit on each call. Pinning only the image tag in a moving branch is insufficient.

Official2.3.3 API sources: [partial UpdateStack](https://github.com/moghtech/komodo/blob/v2.3.3/client/core/rs/src/api/write/stack.rs), [StackConfig commit field](https://github.com/moghtech/komodo/blob/v2.3.3/client/core/rs/src/entities/stack.rs), [execute operations](https://github.com/moghtech/komodo/blob/v2.3.3/client/core/rs/src/api/execute/stack.rs), [Docker inspections](https://github.com/moghtech/komodo/blob/v2.3.3/client/core/rs/src/api/read/docker.rs), [procedure action state](https://github.com/moghtech/komodo/blob/v2.3.3/client/core/rs/src/api/read/procedure.rs). No guessed SSH/terminal endpoint is used.

## Offline plan and explicit execution

The CLI defaults to local validation and an exclusive0600 plan file. Existing authorization is not read or required in plan mode. Prepare the reviewed source backup plan with the existing helper, **not** an old already-executed attempt:

```sh
node scripts/verify-memory-backup.mjs --source-sha "$SOURCE_SHA" \
  --attempt "$UNIQUE_ATTEMPT" --output /absolute/new-source-backup-plan.json
node scripts/schema-upgrade-maintenance.mjs \
  --input /absolute/reviewed-upgrade-description.json --output /absolute/new-maintenance-plan.json
```

Description fields (no other keys accepted):

- `format:1`, `createdAt`: ISO timestamp.
- `source`: exact `backup.source`; `backup`: the full newly reviewed backup plan, unchanged.
- `sourceImageDigest`: verified source image digest for all four actual source containers.
- `target`: `releaseDescriptor(T, exactFormalRelease)` plus `imageDigest`. The public helper derives all migrations/checksums and verifies both root/server manifests and locks; metadata includes runtime/schema/protocol/schemaHash/integrity/tarball. Target product must be47 or48.
- `pinCommit:D`.
- `qualification:{commit:T,ciUrl:<exact successful GitHub Actions run URL>,conclusion:"success"}`. The operator must verify that run and image; the offline validator checks the binding/shape, and does not contact GitHub or claim to independently authenticate CI success.

`sealPlan` adds the canonical `planHash`. Supplying a pre-sealed input also works; execution requires the hash to match, revalidates the source backup command and source history, all target locks/inventory and installed public package metadata. An unqualified/unpublished target does not get a runnable production plan.

Only root, after independent review and actual release prerequisites, invokes:

```sh
# Existing authorized environment injection; never paste secrets into files/args.
node scripts/schema-upgrade-maintenance.mjs --execute \
  --input /absolute/reviewed-maintenance-plan.json --output /absolute/new-private-receipt.json
```

The receipt is exclusively created0600 before the first remote operation and accumulates phases/update IDs. Raw API replies, Config.Env, log bodies, memory, prompts, user IDs and lease tokens are never written. Only package provenance, hashes, fixed service names, aggregate counts and source backup evidence are retained. There are no retry/resume/force flags. Existing receipts/plans are never overwritten by a fresh invocation.

## Bounded execution order

1. Verify the temporary pin/idle state and all four exact source container IDs, image IDs/digest, commit, running/restarting state and restart counts; verify exact source database installation and migration inventory. Pending queued/capture items may be nonzero.
2. Pull `db-migrate`, `lingxiloop`, `worker` images on A and B; inspect each exactT image digest; run DB-free target metadata verification before downtime. Every returned update is bound to the expected operation, stack ID and returned update ID, then polled to `Complete && success:true`. For the required nonempty service lists, Komodo2.3.3 uses exactly `PullStackService`, `StopStackService` and `DeployStackService`; `RunStackService` stays unchanged. Base stack enums are not accepted for these requests. This mapping is defined in [the official update constructor](https://github.com/moghtech/komodo/blob/v2.3.3/bin/core/src/helpers/update.rs). Acceptance is not completion. Requests have60-second limits, pulls/deploys15-minute overall limits, other operations7 minutes. Unknown acknowledgements/polls stop the flow without resubmission.
3. Stop WorkerA,WorkerB,WebA,WebB with150-second stop grace. After each completed stop inspect the original identities; stopped means `Running=false`, `Restarting=false`, PID0 and unchanged restart count. A changed/missing/duplicated container is a failure. Existing running/retrying db-migrate must be resolved separately before entering; this helper does not kill unknown jobs.
4. Two fresh read-only SQL transactions at least2seconds apart require all live work/session/attempt/capture/outbox claims, other client backends and prepared transactions equal0, with full activity visibility. Pending queued work is recorded, not deleted. Any missing field/error/nonzero class blocks migration. This samples a stopped-writer boundary; it does not fence external operators or authorize killing database sessions.
5. Execute the imported reviewed backup helper once, after the barrier. Require its exact source/commandHash, verified consistent dump+isolated restore/provenance/counts and owned restore cleanup receipt. Its own bounded remote timeout/cleanup remains unchanged. Re-inspect all four stopped containers and re-sample the barrier after backup; recheck pin/images/target metadata and sample again immediately before migration.
6. Run exactly one explicit AppA `db-migrate` one-off with `no_deps`, noports, noTTY, no detach and only `env:{LINGXIOS_SCHEMA_UPGRADE_DRAINED:"true"}`. A300-second remote timeout plus30-second kill grace encloses it. Inside that image, validate public package/commit/migration metadata before importing product migration code. Do not export this drain flag elsewhere.
7. Read actual database version, full inventory/checksums and installed package/hash after migration. Require the target47/48 inventory, native13 and exact provenance. Only then deploy/verify WebA,WebB,WorkerA,WorkerB, with each target image/source and actual container health checked within180seconds. Normal Compose may run its already-current idempotent db-migrate dependency; it receives no drain acknowledgement. No old StartStack is implemented.
8. Root completes existing authenticated release smoke and relevant HTTPS verification. The helper's health evidence is direct container readiness, not a substitute for end-to-end/provider tests. It does not claim new provider qualification.

## Exit and failure boundaries

- Before migration, a fresh verified46/12/source provenance can support a separately reviewed old-container recovery. The helper never automatically starts anything after any failure. A failed preflight with unknown provenance stays unknown.
- Unknown execute/transport outcome: keep the barrier, inspect the recorded update and actual state; do not re-run the command with a new receipt to manufacture a second attempt. Remote timeouts do not turn acceptance into a known outcome.
- A known failed migration triggers a fresh read-only state check. Actual native13, installed13 or product>=47 means **fix-forward**, including47committed/48failed. The full target inventory is required for successful recovery. Old schema12 Web/Workers are prohibited; no checksum rewriting, migration deletion, restore-over-new-writes or automaticrollback.
- SuccessfulA is not stopped merely becauseB fails. Root diagnoses the exact failed service and repairs forward with a qualified compatible image; this helper does not replay the whole sequence automatically.
- After four target instances and root smoke are verified, root clears only the temporary pins using `releasePinPayload(actualStackId,"")`, then reads back config/source. Normal resource synchronization can restore these empty commit fields. Subsequent schema13→13 UI releases resume the existing rolling path. Failed/uncertain migration does not auto-clear the pins.
- PostgreSQL backup does not freeze WuKongIM/R2 or cover messages accepted externally after the dump. Disaster restore is a separate authorized recovery decision.

## Validation and remaining gates

- Contract suite covers before-stop failure, actual-stop/lease barriers, backup receipt binding, no unknown retry,47/48 recovery, strict update identity, fixed partial pins, schema gate placement, CI routing and formal-package mismatch. The existing7backup contracts remain green.
- Independent review found and reproduced three checkpoint bugs before production: duplicate equal image declarations blocked normal rollout, maintenance accepted a stale Worker override, and service requests were compared with the base Komodo receipt enum. `REVIEW-FIX-FAILURE-MODEL.md` records the corrections before implementation. Original independent receipts are retained as `validation/review-pin-red.json`, `review-mixed-pin-red.json` and `review-transport-red.json`; they are mock/local evidence, not live production requests. The new regressions first failed6/22 (`review-corrections-red.log`), then passed22/22 plus unchanged7backup contracts (`review-corrections-green.log`). Real A/B Compose files now reach mocked metadata/SQL;12→13 remains refused and13→13 succeeds. Wrong/base operation enums, stack/update identity drift and unknown-result retry remain rejected. Generated metadata inventory escaping passed six cases and was not changed.
- `validation/compose-failure-boundaries.json` records a separate local fake-executable probe: missing CLI, malformed JSON, nonzero exit, oversized output and a10.011-second timeout all reject without stderr content; the fixed command and PATH-only environment also passed. The probe initially expected one generic error string for malformed JSON, then corrected its assertion to accept the two intentionally sanitized errors; no implementation change was required. Its owned temporary executable directory was removed. This checks parser process boundaries, not production Compose or a daemon.
- Dedicated512MiB tmpfs PostgreSQL fixture uses the installed formal native12 SQL schema, never shared55432. It proves read-only enforcement, a real competing idle backend, a real native session lease, and committed47/failed48 classification. All7scenarios passed and the labelled owned container was removed. The first local fixture attempt failed because its synthetic lease columns were incomplete; it was corrected, retained in `validation/local-fixture-red.log`, and did not affect any shared DB.
- `validation/contracts-green.log`, `validation/local-green.log` and `validation/local.json` are local evidence. The wider existing deployment contract run failed only on the known base035a8 participantDisplayName packaging defect; that separate recovery fix belongs to root's other author. `validation/deploy-contracts-known-base-failure.log` preserves34pass/1fail rather than claiming it green. Rebase onto that reviewed fix and rerun the complete owning command before release.
- Still required: independent review; current source S/four healthy image identities; controlled formal3.5.7 source baseline if root releases it first; formally published target package and target migration47/48 qualification; exact-head CI/image; root's temporary pin readbacks; actual production drain/backup/migration/health/smoke receipts. None is a permission denial or an already executed production action.
