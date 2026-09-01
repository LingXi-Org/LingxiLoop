# OpenShip two-server deployment

This layout is the smallest safe split for two 4-core/4-GB hosts. It avoids
creating two unrelated copies of PostgreSQL, WuKongIM, SurrealDB, or Agent
Home data, while Web and Worker can run on both hosts and on later 4-core/4-GB
replicas.

The steady-state container limits total about 2.5 GB on Server A and 3.0 GB
on Server B, leaving the rest for Linux, Docker, filesystem cache, and short
spikes. They are safe starting limits, not a throughput guarantee; watch RSS,
OOM kills, PostgreSQL connections, and worker/Agent queue latency after launch.
Use at least 30 GB of SSD storage on each host, keep backups off-host, and alert
before a state volume reaches 70%; database and IM history determine the real
disk requirement.

It is not full host-level HA: `core-state.yml` is still the authority for
PostgreSQL, Redis, and WuKongIM. A two-node deployment has no independent
quorum. Full one-host-failure tolerance requires managed HA PostgreSQL/Redis
and a supported multi-node WuKongIM/SurrealDB design (normally with at least a
third voting node). The application manifests do not need to change when those
endpoints move.

## Placement

| OpenShip project | Compose path | Target |
| --- | --- | --- |
| `lingxiloop-core-state` | `deploy/openship/core-state.yml` | Server A |
| `lingxiloop-app-a` | `deploy/openship/app.yml` | Server A |
| `lingxiloop-knowledge-agent` | `deploy/openship/knowledge-agent.yml` | Server B |
| `lingxiloop-app-b` | `deploy/openship/app.yml` | Server B |

Set **Sleep mode = Always On** for all four projects. OpenShip's default sleep
mode is unsuitable for databases, background workers, WebSockets, and Agent OS.

Use a provider private LAN or WireGuard/Tailscale between the hosts. Open only
the following private ports to the other host: PostgreSQL `5432`, Redis `6379`,
WuKongIM API `5001`, Open Notebook `5055`, and Agent OS health `5190`. Raw app
`5181` and WuKongIM `5200` bind to loopback by default. Attach OpenShip custom
HTTPS/WSS domains to those services; if an external load balancer reaches the
ports over a private network instead, set `APP_BIND_IP` / `WUKONG_WS_BIND_IP`
to that private address and firewall them to the load balancer. Never publish
the database, Redis, internal APIs, or plaintext ports to the public Internet.

OpenShip environment variables are per project/service. Mark passwords,
tokens, database URLs, R2 credentials, and image registry credentials as
secrets. Use the same application secrets on both app projects.

## Shared values

Set these examples to the real private addresses and public domains (origins
must not end in `/`):

```dotenv
# Both app projects
DATABASE_URL=postgresql://lingxiloop:<password>@<server-a-private-ip>:5432/lingxiloop
REDIS_URL=redis://<server-a-private-ip>:6379
WUKONG_API_URL=http://<server-a-private-ip>:5001
WUKONG_WS_PUBLIC_URL=wss://im.example.com
OPEN_NOTEBOOK_URL=http://<server-b-private-ip>:5055
AGENT_OS_URL=http://<server-b-private-ip>:5190
DATABASE_POOL_MAX=8

# core-state and knowledge-agent callbacks
LINGXILOOP_INTERNAL_ORIGIN=https://origin.example.com

# Project-specific identities
INSTANCE_ID=web-a                 # app-a; use web-b on app-b
AGENT_OS_WORKER_ID=agent-os-b     # knowledge-agent only
PRIVATE_BIND_IP=<that-server-private-ip>
```

`LINGXILOOP_INTERNAL_ORIGIN` must be a stable HTTPS entry point that routes to
the healthy app services. The WuKongIM webhook, Open Notebook embedding proxy,
and Agent OS Host Bridge all use it. Configure the edge/load balancer health
probe as `GET /api/health`; it checks both PostgreSQL and Redis. WebSocket
clients reconnect automatically and presence leases are shared through Redis.

Use immutable digest references produced by CI for
`LINGXILOOP_SERVER_IMAGE`, `AGENT_OS_IMAGE`, and `OPEN_NOTEBOOK_IMAGE`.
WuKongIM automatically uses
`accel.way2api.fun/ghcr.io/lyyzka/lingxiloop-wukongim:mvp`; set
`WUKONGIM_IMAGE` only when overriding it with an immutable digest. Copy the
remaining secrets and product variables from the production environment; the
Compose validation errors name every required value that is missing.

## Deploy order

1. Deploy `core-state` on Server A and enable scheduled backups for all three
   named volumes.
2. Deploy `app-a`. Its one-shot `db-migrate` service applies migrations before
   Web and Worker start.
3. Point `LINGXILOOP_INTERNAL_ORIGIN` at healthy `app-a`, then deploy
   `knowledge-agent` on Server B and back up its three named volumes.
4. Deploy `app-b` with the same shared endpoints and secrets but a different
   `INSTANCE_ID`.
5. Give `app-a` and `app-b` separate OpenShip HTTPS origin domains and put both
   behind an external health-checked load balancer. Give WuKongIM `5200` its
   `im.example.com` WSS domain. As of this layout, OpenShip still treats one
   project deployment as one selected server, so create the two app projects
   separately.
6. Verify both origins, then the stable origin:

   ```sh
   curl --fail https://origin-a.example.com/api/health
   curl --fail https://origin-b.example.com/api/health
   curl --fail https://origin.example.com/api/health/dependencies
   ```

Do not enable GitHub push-to-deploy for these four projects until a coordinated
multi-project release is configured. The repository's current release hook also
targets one `OPENSHIP_PROJECT_ID`; manual mode must not rely on that hook for
this four-project topology. Deploy the same image digests to both app projects,
one at a time, keeping one healthy origin in service.

## Add another 4-core/4-GB server

Create one more OpenShip project from `deploy/openship/app.yml`, give it the
same shared endpoints/secrets and a new `INSTANCE_ID`, deploy it to the new
server, and add its `5181` origin to the load balancer. Do not add another
Agent OS replica: Agent work leasing is distributed, but live IPython variables
and Agent Home remain node-local, so Agent OS stays single-active until session
affinity is implemented. Each added app host can open up to
`2 * DATABASE_POOL_MAX` PostgreSQL connections (Web plus Worker); keep the sum
below PostgreSQL's reserved capacity, then introduce PgBouncer or managed
pooling before that becomes the scaling limit.
