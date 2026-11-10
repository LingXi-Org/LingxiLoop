# Release

Production deploys automatically on every push to `main` once CI passes; a
commit message containing `[skip deploy]` skips it. The same deploy runs from
any clone whose user can read the Sigillo project **LingxiLoop Control Plane**
(env `prod`). Sigillo holds every key, so nothing else needs configuring:

```sh
npm run deploy                          # images → pull → servers + Workers
npm run deploy -- plan                  # pull, then show what would change
npm run deploy -- servers app-a app-b   # one step, optionally some stacks
npm run deploy -- workers
npm run deploy -- status                # deployed images and container health
```

[`deploy/cli.mjs`](../deploy/cli.mjs) re-executes itself under `sigillo run`
(log in once with `npx sigillo@0.14.2 login`; CI sets `SIGILLO_TOKEN`). It
always deploys the committed `HEAD`. On GitHub the same commands are
`gh workflow run deploy.yml -f command=<command> -f stacks="..."`.

## What a deploy does

1. **images** – [`scripts/image-tag.mjs`](../scripts/image-tag.mjs) tags each
   image (server, gateway, wukongim, notebook) with the hash of the committed
   files its Dockerfile copies, so unchanged images are neither rebuilt nor
   restarted. Missing tags are built by [`images.yml`](../.github/workflows/images.yml)
   on GitHub runners; a local deploy dispatches that workflow and waits (the
   commit must be pushed).
2. **pull** – each host fetches its missing images with `ctr` through
   `accel.way2api.fun` (Docker's own proxied pull measured >10× slower).
   Base images are pinned by digest, so code-only changes pull a few MB.
   Before pulling, a per-host lock serializes cleanup and pulls. Cleanup removes
   only obsolete LingxiLoop image tags (including old direct-GHCR tags), retaining
   every container's image, the two newest tagged images per package and all
   target images. It also prunes build cache unused for seven days, retaining
   up to 512 MB. It never removes containers, volumes, backups or other apps'
   images. Older rollback images remain in GHCR and are pulled again as needed.
3. **servers** – writes `deploy/<stack>/` plus a `.env` (exactly the Sigillo
   values its compose file references) and `images.env` to
   `/opt/lingxiloop/<stack>/`, then `docker compose up -d --wait`. core-state,
   ingress, knowledge and uptime converge in parallel, then app-a, then app-b.
   It ends with public readiness probes.
4. **workers** – runs alongside **servers**. Each Worker's version tag is the
   hash of the committed files CI's `web` / `admin` + `control` path filters
   assign it; a Worker whose live tag already matches is skipped (no install,
   no build). Otherwise it builds the SPA and/or Refine admin, applies D1
   migrations for the control plane and `wrangler deploy`s
   `lingxiloop-control-plane` / `lingxiloop-web`.

In CI, images build and the hosts pre-pull while the checks run; only the final
`up` waits for them.

## Hosts and secrets

| Host | Address | Stacks |
| --- | --- | --- |
| txy2 (shanghai-a) | 182.254.156.84, WireGuard 10.20.0.2 | core-state (PostgreSQL, Redis, WuKongIM), app-a |
| txy (shanghai-b) | 111.229.65.23, WireGuard 10.20.0.3 | ingress (Traefik), knowledge (Open Notebook, SurrealDB), app-b (+ gateway), uptime |
| txy3 | 49.232.41.248 | spare |

Sigillo is the source of truth: `DEPLOY_SSH_KEY`, `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `GITHUB_TOKEN` (dispatches image builds),
`LINGXIOS_PACKAGES_TOKEN` and every runtime variable a compose file references
(the knowledge stack's embedding model is `NOTEBOOK_EMBEDDING_MODEL`). To change
runtime config, set it in Sigillo and redeploy the stack; never edit a host
`.env`, it is overwritten. GitHub keeps only `SIGILLO_TOKEN` (a `prod`-scoped
Sigillo API token) plus `LINGXIOS_PACKAGES_TOKEN` for the CI checks. Host keys
are pinned in [`deploy/known_hosts`](../deploy/known_hosts). `cloudflared` on txy
publishes the gateway as `backend.lingxilearn.cn`. `landing` and `lingxilit`
belong to their own repositories and are not deployed from here.

## Failures and rollback

Re-run the failed command; every step is idempotent. `npm run deploy -- status`
shows each host; `plan` shows pending changes without applying them. To roll
back, check out (or revert to) a known good commit and `npm run deploy`: its
tags are still in GHCR, so nothing rebuilds. Migrations are forward-only: never
roll back past a schema change; fix forward instead.

Database migrations run as the `db-migrate` one-shot service before Web/API
starts; both slots run it and the second is a no-op. Because a new Web/API may
enqueue effect kinds an old Worker would mishandle, both old Workers stop before
either slot moves. Migrations must stay forward-compatible with the running
Web/API while slot B still serves the old image.

### Reviewed 3.8.16 → 3.8.17 and 3.8.17 → 3.8.18 runtime patches

The normal `npm run deploy` / CI entry recognizes only these exact runtime
transitions. The next patch preparation retains the existing3.8.17 plan and
its intent hash; a3.8.18 plan uses3.8.17 as its sole source. It requires the formally published package's matching root/server
pins, registry tarball and integrity, the unchanged native14/protocol11 schema,
and the complete identical product58 migration inventory. No version is adopted
by ordinary startup. The dependency must remain on3.8; a4.0 distribution is not
this release path. This infrastructure does not itself publish or pin a package;
product acceptance remains a prerequisite to the separately authorized upgrade.
Until3.8.18 is formally published and its registry archive is verified, manifests
and locks remain on3.8.17. A current3.8.17 test can prove rejection of an
unpublished3.8.18 descriptor; it cannot qualify the actual17→18 CAS. Rerun the
owning product58 checks with the exact formal3.8.18 package and matching locks
before rollout. This runtime-only transition excludes migration0059/schema59.

After images are built and pulled, the target image runs the fixed runtime-patch
entry in a one-shot container. Its read-only preflight verifies installed source
provenance and refuses live work or retained resumable bindings before downtime.
Existing source API clients are allowed during that preflight; the final CAS
still requires zero other database clients and the full original lease barrier.
Already-installed target provenance uses ordinary stack convergence without CAS.

For a new patch, both Workers drain while the source control APIs remain alive;
then both source API containers stop before CAS. Requests queued after the Workers
stop remain unclaimed; the final barrier still refuses any retained binding or
checkpoint. Source container IDs and their runtime version are checked first.
The target entry uses current Sigillo config and privately proves its database URL
matches the deployed source. A persisted per-plan attempt marker is written on
txy2 under `/opt/lingxiloop/runtime-patches/` before the one CAS submission. The
CAS updates only the exact provenance row; it never executes DDL, rewrites leases,
cancels work, changes the migration ledger or deletes product data. Only then do
the ordinary target A/B convergence, health probes and Worker deployment run.

An apply failure triggers one read-only observation, never another apply. A proven
source result restores the original containers in API/Worker health order and
fails the deploy. A proven target continues forward. An unconfirmed observation
or lost drain acknowledgement retains maintenance and fails visibly; inspect the
actual containers and provenance before recovery. A retained attempt marker
blocks a later automatic source-state CAS until operator review; do not remove
it to force a retry. After CAS, fix forward rather than starting a source runtime
against target provenance.

`npm run deploy -- runtime-preflight` is read-only and can inspect the source
before downtime. `npm run deploy -- runtime-observe` is read-only and retains the
exclusive maintenance barrier for confirming an uncertain CAS. The deployed
target image must already be present for these observations. The corresponding
`deploy.yml` commands use the same `production-deploy` concurrency group. No old
controller, release lock, additional credential or permission grant is involved.

## Runtime notes

The reviewed3.8.18→3.8.19 patch instead requires an **already installed
product60** with identical native14/protocol11 and all60 named migration
checksums. It never installs product59/60 or authorizes retirement. A missing or
different ledger fails read-only preflight before any drain. Existing16→17 and
17→18 product58 plans remain unchanged;19 is not accepted for product58/59.

For this exact runtime-only plan, `up`/`servers` use the same single-CAS path
without a retirement flag. Standalone `workers` and ordinary retirement remain
guarded. After the CAS,3.8.19 startup verifies the complete60 ledger and exact
installed19 provenance, then returns without migration or seed writes. Fresh,
partial58/59 and unknown provenance are refused even with maintenance flags;
the migration files themselves and user artifact implementation are unchanged.
Run the owning product60 provenance tests with the actual official19 package
and matching locks before deployment. `status` now reads only the deployed
runtime/schema/ledger digest plus live Worker tag comparisons; it never adopts
versions or prints configuration secrets.

Ordinary chat always uses deep execution with all authorized capabilities.

The reviewed3.8.19→3.8.20 plan uses the same runtime-only product60 path, with
3.8.19 as its sole source. Root/server manifests and locks must identify the
same actual formal3.8.20 registry archive and integrity. The native14/protocol11
schema and complete60 migration inventory remain identical. The source19 plan
and its existing intent hash remain unchanged. Fresh, partial58/59, skipped
source18→20 and unknown provenance are refused; target20 startup only verifies
the already installed exact60 state, without migrations or seed writes.

Test bootstrap retains the actual formal18→19 source path using a separately
verified published19 archive, then performs the exact19→20 CAS. The original
18→19 tests run against that genuine19 fixture; current20 runs its separate
CAS, read-only startup, retained-job and uncertain-commit checks. This isolation
does not replace the product dependency or weaken production provenance.

For the qualified SiliconFlow DeepSeek native producer,20 enables the explicit
native-v3 binding: original-schema business-only batches are valid, while actual
public output still uses its sealed native binding. A current Design request
must first select its authorized skill load before dependent Design tools are
exposed. The required selection comes from the granted catalog; it grants no
capability, supplies no guessed arguments and never skips a format/check receipt.
Its per-response output allowance is16K to accommodate complete native file
arguments; total work and cost budgets remain bounded. `content` stays an exact
JSON string, with explicit encoding guidance rather than repair or coercion.
The provider's [max_tokens contract](https://api-docs.siliconflow.cn/docs/api/chat-completions-post)
controls that output allowance. Qualification counts all model attempts and
rejects recovered truncation as zero-failure evidence.

Requests disable provider thinking for both main answers and auxiliary
validation; providers may still return metered reasoning tokens, and only final
content enters user previews. The default DeepSeek per-attempt timeout is 90
seconds with bounded native recovery; `AGENT_OS_MODEL_REQUEST_TIMEOUT_MS`
overrides it.

The default chat model is SiliconFlow `deepseek-ai/DeepSeek-V4.1-Flash` at
`https://api.siliconflow.cn/v1`. Explicit `OPENAI_MODEL` and `OPENAI_BASE_URL`
values in Sigillo override the defaults; set `SILICONFLOW_USD_CNY_RATE` for the
shared cost ledger. The embedding template pins `Pro/BAAI/bge-m3`. Existing
knowledge embedding contracts reject a model/base change even when dimensions
match: prepare an independently verified compatible index before switching, and
never rename stored vectors or delete the old index to make startup pass.

Worker secrets are managed with `wrangler secret put`. After
`/api/internal/bootstrap-admin` creates the first verified administrator, delete
`BOOTSTRAP_ADMIN_TOKEN`.


## Product61 runtime20 to21 maintenance patch

This exact plan requires already installed formal3.8.20, the complete61 named
migration checksums and unchanged native14/protocol11/publicText3/runTrace1.
Only3.8.20 to the actual formal3.8.21 package is accepted. The target image,
root/server manifests, locks, archive integrity and native schema must agree.
It cannot install61, adopt unknown provenance, skip an earlier product state or
perform retirement. Historical product58/60 plan identities remain unchanged.

The existing standard CLI owns read-only preflight, all-kind retained-work
barriers, Worker drain, both source APIs stopping, one persisted-intent CAS and
ordered target convergence. Live work, retained Slides jobs/checkpoints,
unobservable leases or other final database clients stop the transition. Do
not delete bindings, tasks, attempt markers or business data to force progress.
An uncertain commit requires the existing exclusive read-only observation;
proven source restores its source containers, proven target continues forward.

Target21 startup requires the complete already installed61 ledger and exact21
provenance, then returns without DDL, migration or seed writes. Fresh and
partial58/59/60 databases are refused. Test bootstrap alone uses separately
verified actual19/20 archives to retain the original source qualifications,
install the test-only20/product61 source and perform the exact20 to21 CAS.
No development tarball or source checkout substitutes for a product dependency.

The product suspension regression narrows only preview publication and uses a
synthetic provider with the real Worker/PostgreSQL boundary. It reproduces
formal20's interrupted-before-seal defect, preserves an overlapping first-ACK
success control, and verifies injected product-host seal refusal stays failed
with no result. The specific in-flight-second-ACK race remains covered by the
SDK's independent regression. These deterministic checks establish neither
live-provider generation quality nor browser/teaching-content acceptance.


### Independent read-only Notebook/run observation (#633)

The existing `Deploy production` Actions workflow can run the fixed
`knowledge-observe` command with its already configured `SIGILLO_TOKEN`.
No login, new identity, secret change, extra Actions permission, token export or
local production credentials are needed. After this observation-only change is
reviewed and merged to `main`, the sole integrator can invoke:

```sh
gh workflow run deploy.yml --ref main -f command=knowledge-observe -f run_id='im:88655fc9ed2c99c17d6a980c071367d5867952b20a41e5a2a9f9c0d97cf765e5'
```

Keep **`[skip deploy]` in the merge commit message** for this observation-only
PR. The existing push workflow would otherwise invoke `up` on every main merge.
Do not use `up`, `servers`, `plan` or a runtime patch command to observe.
The observer was extracted from draft #637 into #641, with transport negotiation
fixed in #642; #637 now inherits both as one implementation. The user approved
#637's numerical new-root limits at 11:58 UTC on 2026-11-02. Budget/retrieval
changes now ship independently; the separate embedding route exception remains
pending specific approval and is not included in #637.

The Actions observation skips image builds and selects a separate, fixed CLI
step. The run ID is passed via an environment variable as one quoted argument,
validated before Sigillo or SSH access. `stacks` is ignored for this command.
The CLI returns before image selection, pulls, runtime-patch plans or stack
convergence. It does not stage host deployment files, drain/restart services,
migrate, activate a generation, call a model/provider or retry a run.

The bounded JSON output distinguishes retained `notebook.control` from
`notebook.active`: stored model/endpoint/contract dimensions, aggregate chunk and
invalid-dimension counts, a scalar dimension sample, generation metadata and
pointer revision. `pointerStable=false` means the pointer changed while reading;
these are independent metadata reads, not a transactional migration receipt.
Notebook `configured` reflects Docker's environment, not resolved API state.
`workerA`/`workerB` show four configured limits, not the old root's frozen budget.

The fixed MCP read uses only the existing `LINGXILOOP_MCP_SERVICE_TOKEN` supplied
by the same Sigillo run. A maximum event cursor excludes ordered tool/public-text
events; additional diagnostics are discarded. Only run identity/state, the
reported budget gap and aggregate counters are exported. The formal SDK has no
public frozen-root budget or exact partial-run rejection/reservation reader, so
both stay `unknown`; elapsed time never determines a budget dimension.
Missing/denied existing identity is reported without fallback or new credentials.
Existing authenticated-read auditing remains enabled.

There is no source text, vector value, prompt, tenant content or credential in
the output. Notebook metadata has a 30-second deadline; remote SSH processes are
bounded to 20/45 seconds; the MCP read has a 20-second deadline and 256-KiB cap.
Each view runs once. A failed view preserves the others, reports top-level
`status=partial` and exits nonzero. Inspect each view's status in the Actions log.
The developer task has not dispatched or executed this production observation.

## Approved root budgets and retrieval degradation (#633 / #637)

This release independently applies the user's approved new-root limits of
512 model calls / 8M tokens / $50 / two hours (approved 2026-11-02 11:58 UTC).
These are finite per-root limits, not a global spending cap. The public SDK
retains old roots' frozen limits and native reservation/settlement accounting;
this release neither migrates nor modifies old roots.

Hybrid search settles text/vector requests independently, preserves successful
results with a safe degraded status, honors cancellation and rechecks current
reader/source authorization before returning citations. Saved artifacts survive
partial budget completion and remain available for human continuation.

Notebook compose, embedding endpoint, frontend access boundaries and deployment
preflight are unchanged from main. The global Notebook preflight and endpoint
configuration overrides have been removed from #637; there is no bypass flag.
The existing #641/#642 read-only observation remains unchanged. The separate
embedding failure does not block releasing these approved, independent fixes.

Embedding remains unresolved: the active Pro/1024 generation's exact sealed
endpoint is the frontend `/internal/open-notebook/v1/shadow`, which is denied.
The proposed follow-up is only an exact main-site POST passthrough of
`/internal/open-notebook/v1/shadow/embeddings` to the existing backend path,
keeping all other internal paths and artifact origins denied and preserving
backend authentication, company/model/input checks and ledger accounting.
That changes the frontend access boundary and requires specific user approval.
This release contains only its analysis/test plan, with no route exception,
new token, endpoint relabelling or index migration. See
[the evidence and separate route qualification plan](evidence/issue-633/README.md).


## Native Design/Slides product63 cutover

This release explicitly upgrades `@lyyzka/lingxios@3.8.25` to the published
`@lingxi-org/lingxios@4.0.0`, then applies additive product62 → product63.
The exact reviewed runtime bridge changes only the installed runtime provenance
from 3.8.25 to 4.0.0 while product62 remains unchanged. It requires matching
formal package receipts, the complete immutable product62 inventory, unchanged
native schema14 bytes and an exclusive all-work drain barrier. Unknown CAS
outcomes use the existing read-only observation path; never replay the CAS.
Only after that bridge is confirmed does the product migrator apply63. Startup
and ordinary migrations never adopt mismatched runtime provenance. Repeated
release observation accepts product63 only on installed4.0.0 with the exact63
checksum and unchanged first62 entries. The migration validates the complete existing checksum history, creates
native document/history tables atomically and copies per-person editor context;
it does not convert or overwrite any saved draft. Its repeated execution is a
no-op. Old document files and content-addressed revisions remain available.

The Agent contract intentionally moves from `3.8.24-design-1` to
`4.0.0-native-artifacts-1`; the SDK still pins each admitted work item to its
assembled harness hash. Native writes being disabled does not make those
contracts interchangeable. The historical `perf/issue-683` receipt remains
unchanged. `deploy/harness-receipt.mjs` obtains a fresh receipt from the exact
published SDK and product sources inside each image; missing package access
blocks qualification, and a guessed or manually edited hash is not evidence.

`servers`/`up` now compare the target assembly with both Web and both background
Worker assemblies. If any hash differs, the target image first validates the
reviewed runtime provenance and immutable product62/63 inventory, then
checks **all** nonterminal work (including future queued items, waiting approvals,
expired leases and items without runtime checkpoints) and all live leases. Any
pending item refuses the release before source containers are stopped. The source remains on3.8.25 if this initial
preflight refuses; after a confirmed runtime CAS, recovery moves forward on4.0.0. Keep the
pinned source running until that work finishes through the existing product
flow; never cancel work, change its `harnessHash`, or edit queue state to satisfy
this gate. Waiting work may require the original user's response.

After a successful preflight, both source Workers drain with their source APIs
still available, then both APIs stop. A second read-only barrier requires zero
nonterminal work, live leases, prepared transactions and other database clients.
This catches admissions racing preflight. A known refusal restores the exact
source container IDs and leaves all work untouched. A lost stop acknowledgement
leaves maintenance in place for container observation; do not race it with a
restart. The runtime bridge starts no target application before its exclusive check and
confirmed CAS. The subsequent harness barrier accepts only installed4.0.0;
product63 and target application convergence follow that check. Once
target convergence starts, failure requires compatible fix-forward/recovery;
the deployer does not restart old source containers over a potentially migrated
database. A subsequent compatible fix-forward can inspect stopped containers'
immutable images through a network-disabled one-shot observer, repeat the
barriers and converge forward; it never launches their old application merely
to inspect a hash. Refusal restores only containers that were running when that
attempt began, so an already stopped older Worker stays stopped. Repeating a
failed recreation with a missing container requires the full barrier; an absent
slot is recorded as absent, never assigned a guessed source receipt. Repeating a
release whose four actual harness hashes already match
uses ordinary convergence and preserves its admitted work. Web client publishing
follows the server cutover; standalone `workers` refuses when the four contracts
do not yet match the target.

Before release, archive the candidate receipt generated with the actual locked
package, the focused `deploy/harness-cutover.test.mjs` result and real PostgreSQL
`server/src/__integration__/harness-cutover.test.ts` result with the candidate
commit. `npm run deploy -- harness-observe` is the read-only image comparison
after image build/pull; it prints hashes/contracts without task or tenant data.
This implementation does not itself authorize production observation or deploy.

For this release, keep `NATIVE_ARTIFACT_WRITES_ENABLED=false` in the reviewed
runtime configuration while all Web and background Worker instances are updated.
Verify every instance is on the candidate image with product63 installed before
setting `NATIVE_ARTIFACT_WRITES_ENABLED=true`. Production defaults to disabled
when the flag is absent. This prevents an older instance from writing legacy
files after another instance has converted a document. The deployer rejects an
enabled flag while any observed instance still declares the older contract.
Development/test instances
may enable native writes without this release barrier.

After activation, native document state fences all legacy full-file writes.
A cached old editor must refresh and retain its unsaved draft for recovery; it
cannot overwrite converted pages. Conversion fixes the original file/resource
hashes and writes an independent native representation. Normal undo and revision
restore cannot remove that original manifest or return a draft to the legacy
editor format.

The release no longer copies or retains old editor programs in the application
image. The ordinary web asset lifecycle owns native chunks. Old editor assets
on hosts are no longer mounted or served; their storage can be reclaimed by the
normal reviewed host cleanup after this release is healthy.

Once any native document exists, rollback is limited to a version that supports
schema63 and native document reads/writes. Preserve durable data and fix forward
if an older image cannot meet that contract. Do not roll the schema backward or
restore legacy source files over the current native document.

The official v4.0.0 tag is `6f709b4e41993cf0eb65c40679bc22bc9a67012b`. Its
[publication](https://github.com/LingXi-Org/LingxiOS/actions/runs/41967834715)
reports SHA-1 `8ae8bb3697ec77e4f04149451a395cb57d9eddb8`; the lock uses its
corresponding npm SRI. This published checksum does not prove local installation.
Archive download, checksum validation, actual package execution, PostgreSQL
bridge tests and final image qualification remain mandatory release evidence.
The SDK no longer installs PDF/DOCX parsers automatically; this host explicitly
pins `pdfjs-dist@6.3.289` and `mammoth@1.12.2` to preserve document extraction.


## 原生 Agent 契约更新（#718 / #719）

`4.0.0-native-artifacts-2` 将 Agent 操作改为先准备、后按计划提交。
它与 `4.0.0-native-artifacts-1` 使用相同的 schema63 原生文档、浏览器
操作及正式 SDK 4.0.0；这两个经过审查的契约支持相同的原生文档写入。
在二者之间升级，无须关闭已启用的原生文档写入。缺失实例、旧文件写入
契约或未审查的新版本仍拒绝在写入启用时更新。

文档写入兼容不表示 Agent 任务兼容。实际程序集 hash 不同仍执行完整的
任务预检、源 Worker 排空、入口停止及独占数据库屏障。保留所有历史任务
的固定绑定，不取消任务、不重写队列，也不自动重放旧失败任务。
