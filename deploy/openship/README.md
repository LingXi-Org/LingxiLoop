# OpenShip two-server deployment

This is a two-node Agent OS execution plane around one authoritative state
host. Agent OS workers pull from the PostgreSQL-backed queue; there is no
Redis router or inbound Agent OS traffic. PostgreSQL leases, fences, session
affinity, and idempotent Host actions remain the execution contract.

It is not full host-level HA. Server A still owns the public entry point,
PostgreSQL, Redis, and WuKongIM. If Server A fails, manual recovery is required.
Do not add two-node automatic database or Redis failover without an independent
witness and fencing.

## Placement

| OpenShip project | Compose path | Target |
| --- | --- | --- |
| `lingxiloop-core-state` | `deploy/openship/core-state.yml` | Server A |
| `lingxiloop-app-a` | `deploy/openship/app.yml` | Server A |
| `lingxiloop-agent-os-a` | `deploy/openship/agent-os.yml` | Server A |
| `lingxiloop-app-b` | `deploy/openship/app.yml` | Server B |
| `lingxiloop-knowledge-agent` | `deploy/openship/knowledge-agent.yml` | Server B |
| `lingxiloop-agent-os-b` | `deploy/openship/agent-os.yml` | Server B |

Set **Sleep mode = Always On** for all projects. App A runs Web only. App B
sets `COMPOSE_PROFILES=worker`, so it runs one Web and the background Worker.
Both Agent OS projects start with one execution slot:

```dotenv
AGENT_OS_MAX_CONCURRENT_RUNS=1
```

## Private network and entry point

Use the provider VPC or WireGuard between the hosts. Only Server A accepts
public `80` and `443`; restrict public SSH `22` to administrator source
addresses. Allow these private flows:

| Source | Destination | Ports |
| --- | --- | --- |
| Server B | Server A | PostgreSQL `5432`, Redis `6379`, WuKongIM API `5001` |
| Server A | Server B | API-B `5181`, Open Notebook `5055` |

WuKongIM `5200` stays on Server A loopback and is exposed as WSS through
Nginx. SurrealDB has no host port. Agent OS `5190` is container-local health
only and must not be opened on either host.

The existing备案 domain continues to resolve to Server A. A minimal Nginx
upstream in the `http` context is:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

upstream lingxiloop_web {
    server 127.0.0.1:5181 max_fails=3 fail_timeout=10s;
    server 10.20.0.3:5181 max_fails=3 fail_timeout=10s;
}

server {
    listen 443 ssl http2;
    server_name lingxilearn.cn;

    location / {
        proxy_pass http://lingxiloop_web;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_next_upstream error timeout http_502 http_503 http_504;
    }
}
```

Replace `10.20.0.3` if Server B's private address changes. Probe each API with
`GET /api/health`; dependency status is available at
`GET /api/health/dependencies`.

## Required project values

Both app projects share the same secrets and state endpoints:

```dotenv
DATABASE_URL=postgresql://lingxiloop:<password>@<server-a-private-ip>:5432/lingxiloop
REDIS_URL=redis://<server-a-private-ip>:6379
WUKONG_API_URL=http://<server-a-private-ip>:5001
WUKONG_WS_PUBLIC_URL=wss://im.lingxilearn.cn
OPEN_NOTEBOOK_URL=http://<server-b-private-ip>:5055
AGENT_OS_NODE_TIMEOUT_SECONDS=15
DATABASE_POOL_MAX=8
```

Set project-specific values as follows:

```dotenv
# app-a
INSTANCE_ID=app-a
APP_BIND_IP=127.0.0.1
# COMPOSE_PROFILES is unset

# app-b
INSTANCE_ID=app-b
APP_BIND_IP=10.20.0.3
COMPOSE_PROFILES=worker

# agent-os-a
AGENT_OS_WORKER_ID=agent-os-a
AGENT_OS_VOLUME_NAME=openship-lingxiloop-agent-os-a-agent-os-data

# agent-os-b: preserve the volume created by the former knowledge project
AGENT_OS_WORKER_ID=agent-os-b
AGENT_OS_VOLUME_NAME=openship-lingxiloop-knowledge-agent-agent-os-data
```

Both Agent OS projects use the same `AGENT_OS_SERVICE_TOKEN`, model settings,
and stable callback origin:

```dotenv
LINGXILOOP_CONTROL_PLANE_URL=https://origin-a.lingxilearn.cn
```

The knowledge project also uses that origin for the Open Notebook embedding
proxy. Mark database URLs, tokens, model keys, R2 credentials, and registry
credentials as OpenShip secrets.

## Migration and cutover

1. Back up PostgreSQL and the Server B Agent Home volume. Never use
   `docker compose down -v` during this cutover.
2. Deploy `app-a`; its one-shot `db-migrate` applies the affinity migration.
   Deploy `app-b` with the Worker profile after migration succeeds.
3. Confirm the existing `agent-os-b` is polling the new API, then deploy
   `agent-os-a`.
4. Wait until the old Server B Agent OS `/readyz` reports `activeRuns: 0`,
   stop it, and redeploy the knowledge project without its former Agent OS
   service.
5. Deploy `agent-os-b` with worker ID `agent-os-b` and the preserved volume
   name above. Verify both workers appear in `agent_os_workers`.
6. Point Nginx at API-A and API-B and verify both direct origins before the
   stable domain.

Deploy the same immutable image SHA to both app and both Agent OS projects.
During future releases update both APIs before the Agent OS images. Old
binaries ignore the additive affinity tables; new binaries require migration
readiness before serving.

## Failure and capacity checks

An idle worker refreshes its heartbeat while polling. A busy worker refreshes
it with the existing work heartbeat. New sessions are claimed by the first
worker with a free local slot. A healthy session owner retains affinity. After
15 seconds without a node heartbeat another worker may adopt queued work; an
in-flight hard failure remains fenced until its 45-second work lease expires.
Takeover starts a fresh Home epoch, so PostgreSQL/WuKongIM/session history is
restored but process variables and unpersisted local files are not.

Use the existing health JSON and database state for the first production
stage:

```sql
SELECT worker_id, last_seen_at FROM agent_os_workers ORDER BY worker_id;
SELECT status, COUNT(*) FROM agent_work_items GROUP BY status ORDER BY status;
SELECT leased_by, COUNT(*) FROM agent_work_items WHERE status='leased' GROUP BY leased_by;
```

Keep each node at one slot until peak RSS leaves at least about 700 MB free,
there are no OOM or sustained swap events, load average remains acceptable,
and P95 run duration does not regress. Only then raise both nodes to two slots.

Production manifests contain no WuKongIM demo container. OpenShip, Nginx,
WireGuard, and the second Agent OS add no mandatory recurring service cost.
