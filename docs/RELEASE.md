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

## Runtime notes

Ordinary chat always uses deep execution with all authorized capabilities.
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
