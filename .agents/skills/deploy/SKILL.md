---
name: deploy
description: Deploy, redeploy, roll back or inspect LingxiLoop production (txy/txy2 Docker Compose stacks and the Cloudflare Workers). Use for any release, rollout, production health or host maintenance task.
---

# Deploy LingxiLoop

[docs/RELEASE.md](../../../docs/RELEASE.md) is the whole procedure. In short:

- Merging to `main` deploys automatically after CI. Watch it with
  `gh run list -w deploy.yml -L1` and `gh run watch <id>`.
- Redeploy: `gh workflow run deploy.yml` (inputs `stacks`, `workers`).
- Roll back: revert on `main`; old content-tagged images are reused.
- Local server deploy with SSH access: `deploy/deploy.sh [stack ...]`.
- A deploy is done when the run is green: `deploy.sh` waits for every container
  to be healthy and probes `https://backend.lingxilearn.cn/readyz` and
  `https://loop.lingxilearn.cn/`.

Never print or commit host `.env` files, SSH keys or Cloudflare tokens. Never
`docker compose down -v` or prune volumes; PostgreSQL, WuKongIM, Redis and
SurrealDB data live in named volumes.
