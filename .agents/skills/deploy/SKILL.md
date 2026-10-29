---
name: deploy
description: Deploy, redeploy, roll back or inspect LingxiLoop production (txy/txy2 Docker Compose stacks and the Cloudflare Workers). Use for any release, rollout, production health or host maintenance task.
---

# Deploy LingxiLoop

[docs/RELEASE.md](../../../docs/RELEASE.md) is the whole procedure. In short:

- Merging to `main` deploys automatically after CI. Watch it with
  `gh run list -w ci.yml -L1` and `gh run watch <id>`.
- From any clone with Sigillo access (`npx sigillo@0.14.2 login` once):
  `npm run deploy` (all), or `npm run deploy -- plan|servers|workers|status [stack ...]`.
  It deploys the committed `HEAD`; unbuilt images are built on GitHub first.
- Roll back: check out a known good commit and `npm run deploy`.
- A deploy is done when the command (or CI's `deploy` job) succeeds: it waits
  for every container to be healthy and probes `https://backend.lingxilearn.cn/readyz`
  and `https://loop.lingxilearn.cn/`.

All keys and runtime config live in Sigillo (LingxiLoop Control Plane / prod);
change config there and redeploy, never on a host. Never print or commit
secrets. Never `docker compose down -v` or prune volumes; PostgreSQL, WuKongIM,
Redis and SurrealDB data live in named volumes.
