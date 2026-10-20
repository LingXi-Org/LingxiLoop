# Explicit host release

Use `scripts/host-release.mjs` only after the preceding production release has a sealed successful acceptance. This path keeps Komodo's native host-file source, leaves core-state and app B's gateway unchanged, and does not call the legacy rollout procedure. The normal trigger still rejects unexplained host/pinned state.

The same-schema format supports native13/product48 or product49. Source and target must have identical runtime version, published package tarball/integrity, protocol, native schema/hash and every product migration name/checksum. It never imports the application migrator. Web A, Web B, Worker A, Worker B are the only deploy targets.

The separate `product-schema-host-release/v1` format permits only the reviewed
runtime3.5.8/native13/product48→49 transition. Formal package/protocol/native
provenance and the first48 migrations must match exactly; migration49 must be
`conversation_list_removals` with SHA256
`d7d52a20d4b093910083524ae324d3e865012d791c7eecd2340d82b51528e15d`.
No downgrade or arbitrary migration number/checksum is accepted. Subsequent
49→49 releases use the same-schema format with the complete identical49 inventory.

## Qualification and plan

All input paths below are absolute. A plan is sealed from a descriptor by the offline default mode. The CLI independently checks the accepted source receipt, image audit bytes, Git objects, four package manifests/locks, migration files, effective Compose and locally installed formal package. Use the already qualified dependency installation; no installation, image build, credential discovery or remote request is performed by plan mode.

Descriptor fields:

| Field | Contract |
| --- | --- |
| `format` | `same-schema-host-release/v1`, or explicit `product-schema-host-release/v1` for the reviewed48→49 transition only. Neither supports a native schema upgrade. |
| `createdAt` | ISO timestamp. |
| `source`, `target` | `releaseDescriptor(commit, formalRelease)` output plus `image` below. |
| `sourceAcceptanceSha256` | SHA256 of the previous successful acceptance JSON bytes. It must have `passed:true`, exact source `candidate`, and every named check true. |
| `qualification` | `{commit: target.sha, conclusion:"success", ciUrl:"https://github.com/LingXi-Org/LingxiLoop/actions/runs/<id>"}` from verified exact-target CI. |
| `stacks` | Ordered app A, app B, core-state records below. |
| `planHash` | Created by offline sealing; never hand-edit a sealed plan. |

Each `image` is `{indexDigest,configDigest,manifestDigest,diffIds,auditSha256}`. Populate from the actual passed full linux/amd64 OCI audit: `manifestDigest=linuxAmd64ManifestDigest`, `diffIds=layers.map(layer=>layer.diffId)`, and `auditSha256` hashes its exact JSON bytes. Image audit files must match the candidate source and digest identities. Docker's actual per-host `InspectImage.Id` is established online; it is not inferred from the OCI config digest.

Each stack record is:

```json
{
  "stack": "lingxiloop-app-a",
  "server": "shanghai-a",
  "source": {
    "commit": "<accepted manifest commit>",
    "branch": "release/<accepted branch>",
    "sha256": "<hash of exact tracked compose.yml bytes>",
    "autoPull": true,
    "extraArgs": []
  },
  "target": {
    "commit": "<candidate manifest commit>",
    "branch": "release/<candidate branch>",
    "sha256": "<hash of exact tracked compose.yml bytes>",
    "autoPull": false,
    "extraArgs": ["--no-deps", "--pull", "never"]
  },
  "preparation": {
    "commit": "<separately committed online pull template>",
    "sha256": "<hash of exact tracked compose.yml bytes>"
  }
}
```

App B uses `shanghai-b`. Core uses `shanghai-a`, has no `preparation`, and its entire source and target records must be equal. Record actual accepted source policy; do not assume all previous releases used `autoPull:true`.

The target app templates must pin all three app services (`db-migrate`, `lingxiloop`, `worker`) to the exact target image and use effective `pull_policy: never`. The preparation templates have the same target pin and `pull_policy: always`. They may differ from the accepted templates only in those image/pull-policy fields. Environment, security, volumes, commands, ports, resource limits and gateway configuration must be unchanged. Raw templates must be regular tracked Git files at their exact per-stack manifest commits. Target manifest commits require `[skip deploy]`.

Use separate commits for accepted source, temporary pull policy and final never policy as needed. These are public source artifacts; do not render environment substitutions or copy production `.env` into them. Native `WriteStackFileContents` records its contents in Komodo logs.

```sh
node scripts/host-release.mjs \
  --input /absolute/descriptor.json --output /absolute/plan.json \
  --acceptance /absolute/source-acceptance.json \
  --source-audit /absolute/source-image-audit.json \
  --target-audit /absolute/target-image-audit.json
```

The plan records exact-head CI qualification; the designated release owner must obtain its successful GitHub receipt. An arbitrary URL in a descriptor is not evidence of CI success. Production execution remains gated by the owning release review, exact source acceptance and image audit.

## Image cache preparation

Normal `--execute` requires both target images already cached and qualified before staging or stopping. Missing/drifted images fail closed.

Komodo2.3.3 has no public Core server PullImage action. The driver does not call its private Periphery counterpart. If explicit online preparation is needed:

```sh
node scripts/host-release.mjs --prepare-images \
  --input /absolute/plan.json --output /absolute/new-image-preparation-receipt.json \
  --acceptance /absolute/source-acceptance.json \
  --source-audit /absolute/source-image-audit.json \
  --target-audit /absolute/target-image-audit.json
```

This uses only existing injected `KOMODO_API_KEY`/`KOMODO_API_SECRET`. It keeps all four accepted containers healthy and unchanged, stages the qualified pull template on one app stack, invokes native `PullStack` for `db-migrate` only, verifies exact terminal receipt and cached index/platform/layers, then restores the original accepted template. It repeats for the other host. It does not update stack config, deploy services or migrate. It always pulls when explicitly selected; do not select it if normal cached-image qualification already passes.

A partial or uncertain preparation does not restore/retry automatically. Preserve its receipt, resolve the known update, inspect the exact remaining host files, then review the narrow restoration of accepted public bytes. Normal release refuses a leftover preparation template.

## Release and acceptance

```sh
node scripts/host-release.mjs --execute \
  --input /absolute/plan.json --output /absolute/new-release-receipt.json \
  --acceptance /absolute/source-acceptance.json \
  --source-audit /absolute/source-image-audit.json \
  --target-audit /absolute/target-image-audit.json
```

The receipt is exclusively created and records every known update ID. Only one designated executor may own a production release. Native action/procedure guards and exclusive local files are not a distributed release lock.

The driver first verifies actual source DB and images, stages exact target public files, makes the narrow app-only provenance/`auto_pull`/`extra_args` update with full config readback, and runs actual DB-free target metadata on both hosts. Both old Workers then stop with bounded grace. Two read-only observations must show zero live work/session/attempt/capture/outbox leases and no prepared transaction. Web connections and queued work are allowed.

For the product-schema format only, after both old Workers stop and the two
zero-lease observations pass, the driver submits exactly one native
`RunStackService` for app A's `db-migrate`, with no dependencies, ports, detach,
pull or environment override. Exact target image metadata is checked before
importing the existing public `server/src/migrate-bin.ts` entrypoint. No
`LINGXIOS_SCHEMA_UPGRADE_DRAINED` marker is set. Require the native terminal
success and marker, then fresh runtime3.5.8/native13 and complete49-row migration
inventory before any new Web deployment. Old Web remains online.

The migrator owns its advisory lock, transaction, checksum ledger and the new
table's 5-second lock timeout. Migration49 adds an empty preference table and
foreign keys; it does not rewrite shared history, membership or native state.
The existing public migrator also upserts the fixed education plan, entitlement
definitions and plan-entitlement values after migrations. Those definitions and
the seed implementation are unchanged from the accepted product48 source; this
is not a claim that the entire command performs no other writes. It does not
reassign companies to another plan. Preserve this public entrypoint behavior
instead of bypassing it with a private SQL runner.
The existing skill's snapshot/restore and all-writer shutdown requirement for a
native schema upgrade does not apply to this additive product-only transition.
No additional backup/restore, browser or provider acceptance suite is introduced.

It then deploys Web A, Web B, Worker A, Worker B with exact host source, image and health checks. It checks the expected complete DB provenance throughout and retains each newly healthy target's container identity. It does not require new Worker A's legitimate leases to be zero before starting Worker B.

`auto_pull=false` suppresses Komodo's separate pre-deploy pull. `extra_args=["--no-deps","--pull","never"]` suppresses Compose dependency creation and pulling during `up`; all three services' `pull_policy: never` also covers metadata `run`, whose public Komodo request does not expose a pull-policy override. Core's unchanged read-only SQL oneoff retains its current source/image policy and is still an availability dependency.

A `complete` driver receipt establishes the ordered transaction's actual source/image/state/health checks. The release owner must still seal external HTTPS version, readiness, dependency health and audited public-asset comparisons, and any available authenticated smoke, before declaring the new release accepted.

## Recovery and permanent integration

There is no automatic rollback/resume command. Unknown submission, failed source readback or acknowledgement without exact config proof stops all further requests. Known failures may perform one fresh read-only state check to classify whether same-schema recovery remains reviewable; that classification never starts a service.

For48→49, a known failed action with fresh exact48 inventory is classified as
`source-unchanged-recovery-requires-review`; fresh exact49 is `fix-forward`.
Any other provenance or uncertain read remains unknown. Preserve the failed
receipt and native update ID; never automatically repeat migration or continue
deployment. Even though the DDL is additive, old48 binaries reject the49 ledger
at startup. After49 commits, do not restart old48 or delete the new ledger/table
as rollback. Recovery must use an independently reviewed49-compatible target.

For reviewed recovery, first resolve every saved update and confirm the failed executor is dead. Verify exact current DB provenance and all partial host/config/container identities. Drain any new Workers before restoring the previous compatible image. Restore only reviewed public source bytes and narrow source-policy fields through the native APIs, then deploy in the same service order with cached-image/health checks. Seal a new receipt that retains the original failed one. No database restore, native downgrade, credential/security/environment change or broad procedure is authorized by this driver.

Do not reenable the legacy ordinary pipeline after using this path. Its existing preflight rejects host mode before sync/deployment. A later integration must declare per-stack host mode in desired resources, allowlist ResourceSync changes, route ordinary application releases through this driver and serialize release ownership. This change fixes CI's manifest checkout to the exact `update-manifests` output, but intentionally does not run or unlock the old broad procedure.

## Owning checks

```sh
node --test scripts/host-release.test.mjs scripts/host-release-transport.test.mjs scripts/host-release-komodo.test.mjs
node --test --test-name-pattern 'effective candidate' scripts/host-release.local.test.mjs
```

The real local Docker contract additionally requires an already cached `redis:7-alpine` image and a Docker daemon:

```sh
node --test scripts/host-release.local.test.mjs
```

It only retags that existing image under an unreachable loopback registry and uses a unique local Compose project, cleaning those exact resources afterward. It performs no image build or registry pull. It writes `/tmp/host-release-compose-contract.json`; local Compose2.40.3's `-T` spelling limitation is explicitly recorded. See [the failure model](host-release-failure-model.md).
