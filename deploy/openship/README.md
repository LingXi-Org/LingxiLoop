# OpenShip production deployment

Production is the six-project, two-server OpenShip topology below. Each role
has an explicit Compose file; production does not use profiles or the local
MVP Compose stack.

| OpenShip project | Compose path | Target | Services |
| --- | --- | --- | --- |
| `lingxiloop-core-state` | `deploy/openship/core-state.yml` | Server A | PostgreSQL, Redis, WuKongIM |
| `lingxiloop-app-a` | `deploy/openship/app-a.yml` | Server A | migration, Web/API |
| `lingxiloop-agent-os-a` | `deploy/openship/agent-os.yml` | Server A | Agent OS |
| `lingxiloop-app-b` | `deploy/openship/app-b.yml` | Server B | migration, Web/API, worker, gateway |
| `lingxiloop-knowledge-agent` | `deploy/openship/knowledge-agent.yml` | Server B | SurrealDB, Open Notebook |
| `lingxiloop-agent-os-b` | `deploy/openship/agent-os.yml` | Server B | Agent OS |

Keep every project Always On with OpenShip auto-deploy disabled. GitHub Actions
builds all five LingxiLoop images with one immutable commit tag, pins every
OpenShip manifest, deploys the control-plane Worker, then sends one signed
release request that fans out to all six projects. A deployment-only manifest
change reuses the complete pinned cohort and still performs the six-project
rollout.

## Network contract

Server B is the only public application ingress. OpenShip Edge terminates TLS
and routes the retained hostnames to the gateway on `127.0.0.1:8080`. Private
traffic is limited to:

| Source | Destination | Ports |
| --- | --- | --- |
| Server B | Server A | API-A `5181`, WuKongIM API `5001`, WSS `5200`, PostgreSQL `5432`, Redis `6379` |
| Server A | Server B | Open Notebook `5055` |

WuKongIM `5200` and API-A `5181` bind to Server A's `10.20.0.2` address.
SurrealDB has no host port. Agent OS `5190` remains container-local. The
gateway serves the apex and `www`, balances `loop` across both APIs, and
proxies `im` to WuKongIM.

Retained DNS-only A records point to Server B (`111.229.65.23`):
`lingxilearn.cn`, `www.lingxilearn.cn`, `loop.lingxilearn.cn`,
`im.lingxilearn.cn`, and `openlit.lingxilearn.cn`. The admin Worker uses
`https://admin.lingxilearn.cn`; OpenShip uses
`https://ops.christmas1314.xyz`.

## Required values

Both app projects share the authoritative state endpoints and secrets:

```dotenv
DATABASE_URL=postgresql://lingxiloop:<password>@10.20.0.2:5432/lingxiloop
REDIS_URL=redis://10.20.0.2:6379
WUKONG_API_URL=http://10.20.0.2:5001
WUKONG_WS_PUBLIC_URL=wss://im.lingxilearn.cn
OPEN_NOTEBOOK_URL=http://10.20.0.3:5055
AGENT_OS_NODE_TIMEOUT_SECONDS=15
DATABASE_POOL_MAX=8
```

Set `INSTANCE_ID=app-a` or `INSTANCE_ID=app-b` in the matching project. Set
`AGENT_OS_WORKER_ID=agent-os-a` and `agent-os-b` in their matching Agent OS
projects. Both agents start with `AGENT_OS_MAX_CONCURRENT_RUNS=1` and use the
same service token, model settings, and callback origin:

```dotenv
LINGXILOOP_CONTROL_PLANE_URL=https://loop.lingxilearn.cn
```

The knowledge project uses the same origin for its embedding proxy. Store
database URLs, tokens, model keys, R2 credentials, and registry credentials as
OpenShip secrets. Do not expose or copy them into source files.

## Verification

After every rollout, require all six OpenShip deployments to reach `ready`,
all expected production services to report healthy, no drift issue, both Agent
OS heartbeats to be current, and the public Web/API/IM probes to pass. App A
must contain only `db-migrate` and `lingxiloop`; App B must contain exactly
`db-migrate`, `lingxiloop`, `worker`, and `gateway`.
