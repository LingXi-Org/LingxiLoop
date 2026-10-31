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
