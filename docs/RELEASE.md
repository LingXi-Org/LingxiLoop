# Release

Production deploys automatically on every push to `main` once CI passes. A
commit message containing `[skip deploy]` skips it. One run takes roughly
5–15 minutes; unchanged parts are no-ops.

```sh
gh workflow run deploy.yml                                   # redeploy current main
gh workflow run deploy.yml -f stacks="app-a app-b" -f workers=false
gh run watch "$(gh run list -w deploy.yml -L1 --json databaseId -q '.[0].databaseId')"
```

## What a deploy does

[`deploy.yml`](../.github/workflows/deploy.yml) runs three jobs:

1. **images** – [`scripts/image-tag.mjs`](../scripts/image-tag.mjs) gives each
   image (server, gateway, wukongim, notebook) a tag that is the hash of the
   committed files its Dockerfile copies. A tag already in GHCR is skipped;
   otherwise it is built and pushed to `ghcr.io/lingxi-org/<image>:<tag>`.
2. **servers** – [`deploy/deploy.sh`](../deploy/deploy.sh) over SSH:
   pulls missing images with `ctr` through `accel.way2api.fun` (Docker's own
   proxied pull path is >10× slower from mainland China), stops both old
   Workers if the server image changes, then for each stack copies
   `deploy/<stack>/` to `/opt/lingxiloop/<stack>/` and runs
   `docker compose up -d --wait`. Order: core-state, ingress, knowledge, app-a,
   app-b, uptime. It ends with public readiness probes.
3. **workers** – builds the SPA and Refine admin, applies D1 migrations and
   `wrangler deploy`s `lingxiloop-control-plane` and `lingxiloop-web`.

An agent with SSH access can run the server part locally from the repository
root with the same result: `deploy/deploy.sh [stack ...]` (`DEPLOY_TXY`,
`DEPLOY_TXY2` override the `root@<ip>` targets, e.g. SSH config aliases).
Images for the checked-out commit must already be in GHCR.

## Hosts

| Host | Address | Stacks |
| --- | --- | --- |
| txy2 (shanghai-a) | 182.254.156.84, WireGuard 10.20.0.2 | core-state (PostgreSQL, Redis, WuKongIM), app-a |
| txy (shanghai-b) | 111.229.65.23, WireGuard 10.20.0.3 | ingress (Traefik), knowledge (Open Notebook, SurrealDB), app-b (+ gateway), uptime |
| txy3 | 49.232.41.248 | spare |

Each `/opt/lingxiloop/<stack>/.env` holds that stack's secrets; it lives only on
the host and is never committed or printed. `images.env` beside it records the
images currently deployed. `cloudflared` on txy publishes the gateway as
`backend.lingxilearn.cn`. `landing` and `lingxilit` belong to their own
repositories and are not deployed from here.

GitHub needs the `DEPLOY_SSH_KEY` (root key for both hosts),
`CLOUDFLARE_API_TOKEN` and `LINGXIOS_PACKAGES_TOKEN` secrets and the
`CLOUDFLARE_ACCOUNT_ID` variable. Host keys are pinned in
[`deploy/known_hosts`](../deploy/known_hosts).

## Failures and rollback

Re-run the failed job; every step is idempotent. Inspect a host with
`ssh root@<ip> 'cd /opt/lingxiloop/app-a && docker compose ps && docker compose logs --tail 100'`.
To roll back, revert the commit on `main` (the old tags are still in GHCR, so
nothing rebuilds). Migrations are forward-only: never roll back past a schema
change; fix forward instead.

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
values in the app `.env` override the defaults; set `SILICONFLOW_USD_CNY_RATE`
for the shared cost ledger. The embedding template pins `Pro/BAAI/bge-m3`.
Existing knowledge embedding contracts reject a model/base change even when
dimensions match: prepare an independently verified compatible index before
switching, and never rename stored vectors or delete the old index to make
startup pass. To change a host `.env`, edit it on the host and redeploy that
stack.

Worker secrets are managed with `wrangler secret put`. After
`/api/internal/bootstrap-admin` creates the first verified administrator, delete
`BOOTSTRAP_ADMIN_TOKEN`.
