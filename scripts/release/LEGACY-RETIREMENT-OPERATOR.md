# Fixed #495 retirement actor

This module is prepared locally. It has not been run against production. Only
the designated root operator may execute `apply`, after the separately approved
runtime acceptance/recovery and the PR #506 merge. No new permissions, Variables
reads/writes, debug endpoint, app deployment, PullStack, RunSync, Delete or service
execute operations are added.

While business batches remain paused, merge this maintenance change with the
existing `[skip deploy]` commit-message guard. Controller enablement does not
authorize a normal main push to deploy those paused changes; qualification CI
uses the separately authorized `publish_only=true` dispatch.

Use the existing Sigillo wrapper, with redaction enabled. The same existing
`KOMODO_API_KEY`, `KOMODO_API_SECRET`, `RELEASE_API_TOKEN`, `EXECUTOR_TOKEN`,
`CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET` provide only the already
authorized requests. Never put their values in CLI arguments or evidence files.

```sh
source /workspace/.lingxi-production/env.sh
lingxi-prod run node --use-env-proxy --experimental-sqlite /absolute/scripts/release/legacy-retirement-operator.mjs plan /private/evidence.json sha256:<exact-file-sha256> /workspace/scratch/handoff-495/legacy-retirement-read-2305.json
lingxi-prod run node --use-env-proxy --experimental-sqlite /absolute/scripts/release/legacy-retirement-operator.mjs apply /private/evidence.json sha256:<exact-file-sha256> /workspace/scratch/handoff-495/legacy-retirement-read-2305.json /private/retirement-journal.json
```

`plan` is entirely offline and refuses incomplete qualification evidence. `apply`
also checks current existing controller records, each recorded host operation,
latest acceptance and all Komodo object/action states before the first write.
The CLI binds the exact provided 23:05 snapshot by canonical SHA-256
`03edb2e2a383229c4b9596a80b67f222fedf3e4d4266664eecd7ec81b09640c7`.
The shared source is bound to SHA-256
`cca6816135ad1781c342493f3dbde3148728aff1ea20519a1e2a9799ee14ba69`,
including ingress pin `816433430c71887905bf277d6ced523cc92f6674`.

Runtime/controller operations are bound to reviewed stage-protocol head
`4de017e61253f39931c4b861d121f1508369de53` (`OPS_SHA`). The sole legacy accepted
exception is the already-admitted gen6 manifest with Ops d378, completed only by
the explicitly qualified read-only protocol-2 verification described below.
The retained ingress route bytes are unchanged, so `INGRESS_SOURCE_SHA` remains
the previously qualified 816 commit. Shared source/rollback hashes and the seven
approved metadata updates therefore remain unchanged. This is a required version
binding; execution still requires the actual acceptance/recovery, variable, CI
and zero-inflight inputs. A successful production qualification is not itself
permission to skip the remaining retirement gates.

## Root-supplied evidence bundle, version 1

The owning tests use synthetic network-free operation fixtures plus one fixed
nonsecret real legacy verified receipt (identities only, no host policy,
environment/credentials or business rows). Neither is an execution bundle.
Assemble the real bundle from the original
receipts below; do not replace them with `accepted:true` or `zeroInFlight:true`.
The `evidenceHash` export hashes recursively sorted JSON, prefixed `sha256:`.
`receiptText` and the CLI evidence-file hash use their exact original bytes.

* `opsSha`: the exact `4de017e61253f39931c4b861d121f1508369de53`.
* `runtime`: `{manifest, record, verified}`. `manifest` is the actual registered
  complete A/B runtime manifest; `record` is its current authenticated
  `/v1/releases/<id>` response with status `accepted`; `verified` is the actual
  `releases/<id>/verified.json` body. Its observations must equal the record's
  complete target observations. Both hosts need successful prepare, drain,
  apply, verify, undrain and named readiness/business probe receipts. A new Ops
  acceptance needs its complete forward protocol-2 checkpoint. The already
  accepted legacy case is restricted to release
  `accept-495-runtime-mcp-197e-d378`, generation **6**, app
  `197e2568d46de349bb3ce0a26aefbadaae8f4723`, manifest Ops
  `d378bcda174783da88b5e42b93e05e97afb4b68b`, canonical manifest hash
  `sha256:c1f09a9ebbf4e8a63c1eb58cd3120f3f6048814756902c0094bf9926c98ec9e0`.
  Its original ten complete host receipts must have canonical hash
  `sha256:e1a4d21f51849431264599922947622a28b569d99c78fce708dfeb31f5ba3b9c`.
  Its exact R2 verified body has canonical hash
  `sha256:7a0a22bc1af9569de886145cd39e720f0d44c792aac80e18aa8c5d4b0f6c7198`;
  its checkpoint has `legacyVerificationOnly:true`, no changed targets or
  submitted mutations, and only the two completed runtime probes followed by
  acceptance. This does not authorize another host publication or other old
  Ops manifests. The live full records and host receipts are read back exactly.
* `recovery`: `{manifest, record, receipt, receiptText, archive}`. This is a
  different real qualification release, with status `recovered` and source ID
  equal to the accepted runtime release. Runtime contracts, source/forward/
  recovery image identities, installed versions, configuration hashes and
  durable volume mappings must agree (native/product schema 14/57). Recovery
  uses the current 4de Ops; the fixed legacy exception above permits the
  already-proven d378 source without repeating its host mutations.
  Both hosts need all forward phases plus `recovery-drain`, `recover`, and
  `recovery-undrain` receipts; direction comes from the real R2 protocol-2
  checkpoint, not the former `targets.recovery.direction` field.
  The deliberate frontend fault does not change business code or data.
* `recovery.receipt`: the private immutable R2 recovery evidence JSON body with
  `releaseId`, `opsSha`, `manifestHash`, `generation`, `recordHash` (canonical
  hash of the real recovered safeRecord), and ISO `observedAt`. It also contains
  `postRecovery.hosts.a/b = {nativeSchema:14,productSchema:57,images:<actual-map>,
  volumes:<actual-service:target-to-source-map>}`,
  `postRecovery.probes["recovery-495-absence"] = {status:404}`, and
  `postRecovery.frontend = {versionId:<actual-restored-version>,percentage:100}`.
  Images must equal each real recover operation result, and frontend version
  must match the manifest's recovery artifact. `receiptText` is the exact R2
  object's JSON text. `archive` contains its original `{key,sha256,size,etag}`;
  the key must include the recovery release ID. No nonexistent recovered
  `verified.json` is required.
  The qualification body also includes `recovered:{body,text,archive}`: the
  complete actual `releases/<id>/recovered.json` JSON, original bytes and
  `{key,sha256,size,etag}` readback. This inner body must match the live
  observations and `progress`, with the exact finite forward/recovery plan,
  23 completed business stages, original per-host phase deadlines and retained
  request counts (each integer at most 32). `serial=completed.length+1` proves
  one known failed forward probe/recovery transition without additional admin
  resumes; the original `BUSINESS_PROBE_FAILED` and its request count remain.
  Changed targets must be frontend and both runtime nodes, direction
  `compatible-recovery`; all completed provider instance IDs and the final ID
  must be complete. IDs are read from receipts, not reconstructed from the
  release name. This validates the current three-target same-schema exercise,
  not an arbitrary different or schema-changing recovery plan.
* `controller.userReadback`: `{source:"parent-trusted-user-readback",messageId,
  observedAt,text,sha256,values:{RELEASE_CONTROLLER_ENABLED:"true",
  RELEASE_OPS_SHA:"4de017e61253f39931c4b861d121f1508369de53"}}`. `sha256` binds the trusted user's original
  text. The current known false receipt cannot pass this check. The actor does
  not retry the already denied Variables/Secrets API or switch identities.
  These are the required final Variables values, not a claim that a user has
  already supplied this readback. The earlier 816 acceptance and manually
  continued gen5 recovery cannot replace the current qualification. The fixed
  read-only gen6 acceptance is allowed only with the complete new 4de automatic
  recovery proof; there is no generic old-Ops bypass.
* `controller.ci`: actual provider exports `{run,dispatch,baseline,jobs,artifacts}`
  for a successful **main publish_only=true** workflow dispatch. `dispatch` is
  the original request with `{ref:"main",inputs:{publish_only:true}}`. `run` is
  its raw GitHub run response; `jobs` and `artifacts` are complete raw list
  responses. The cumulative step, checks, publish identity/archive generation
  and artifact-upload steps must succeed; prepare-static, register-candidate,
  report-release, update-manifests, deploy and rollout must explicitly be
  skipped. This proves the new CI staging/gating without deploying paused app
  changes from current main. `baseline` is that run's actual downloaded
  `accepted-baseline.json`, linked to the independently accepted runtime ID.
* `zero`: `{readOnly:true,observedAt,submissions,workflows,hosts,legacyActions}`.
  The original exports must be no older than 120 seconds at validation and
  each write. `submissions` is root's exhaustive inventory of all actual
  `POST /v1/releases` submit intents, each `{releaseId,manifestHash,intentSha256,
  record:<current-live-terminal-record>}`. Unmatched/unknown intents refuse
  retirement. Artifact upload intents are not release submissions.
  `workflows` is the official current complete [Workflow instances list response](https://developers.cloudflare.com/api/resources/workflows/subresources/instances/methods/list/)
  (`success`, `result`, `result_info`); every instance must be terminal and the
  two qualifications complete. Provide all pages, not a truncated first page.
  `hosts.a/b` are actual readonly journal/ingress exports with `{readOnly:true,
  pending:[],reservations:[],ingress:{enabled:true,generation:<actual>}}`.
  `legacyActions` is the raw known-legacy Actions in-flight list with
  `total_count:0,workflow_runs:[]`. This uses existing provider/host reads and
  does not require a nonexistent DO all/locks/debug API.
* `merge`: the real merged PR #506 response, including `number:506`,
  `merged:true`, `merge_commit_sha`, and `base.ref:"main"`.

The trusted root maintains inventory completeness and the exclusive handoff
window. Provider exports and the parent user's readback are trusted inputs;
they are not claimed to be independently signed provider attestations. Hashes
bind their exact contents, and existing authenticated live records independently
cross-check the release/host evidence. A fresh zero snapshot must be recollected
if the actor's deadline expires; do not merely edit its timestamp.

## Fixed effects and unknown outcomes

The order is exactly ResourceSync source/webhook-off (managed/delete false), old
Procedure triggers off, four owned Stack webhook/poll/update flags off, retained
ingress metadata commit pin 816, then RefreshResourceSyncPending. It never runs
that sync or pulls the pinned source. Readback rejects unowned or destructive
preview targets. It hashes all unowned config fields in memory and verifies they
remain unchanged, including shared stacks, complete stages and private values.
No environment values or full remote configs enter the private local journal.

The existing kernel flock serializes CLI use. Each attempted write has a private
fsynced local intent **before** the POST. Every result is read back. An unknown
write/readback stops; rerun with the same journal and freshly re-observed zero
evidence to query it. Existing intents are never re-POSTed, even if the desired
state has not appeared. Auth failures are not retried. No automatic rollback
reenables old publishers after an unknown result.

The journal retains nonsecret original changed fields and exact source hashes.
`rollbackBodies(plan, oldSource)` materializes actual restore request bodies
only in memory, without submitting or logging them. The original template must
come from Git `33e97c9f98606f22f2762e5cab2bc66ccd2291ff` and match SHA-256
`5e2fa5e7ec7fb401ae4021a8b8730ecd127a77bf5f73be0b4c49bb9d8ba987e9`.
The exact non-secret historical bytes are bundled at
`fixtures/legacy-resources-33e97c9f.toml`, retaining variable references. The
operator reads this fixed, hash-checked template without requiring Git history
in a shallow checkout. It never substitutes the changed current resources file.
Restoration preserves ingress pin 816; that source has SHA-256
`f92e316937d35ca93ae3c26cbccc7789492f37085731f789f17b9e2596b0e024`.
The root must separately establish exclusive rollback ownership before using
those reviewed bodies; publisher configuration rollback does not roll back
business containers, images, schemas or durable data.

## Local verification

```sh
node --experimental-sqlite --test scripts/release/legacy-retirement-operator.test.mjs
```

Tests use injected fake clients. No production read/write is performed by them.
