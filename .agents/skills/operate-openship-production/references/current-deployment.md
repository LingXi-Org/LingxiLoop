# Current production deployment

Snapshot: 2026-09-03 12:44 China Standard Time, checked through OpenShip MCP, GitHub CLI, HTTP probes, Uptime SQLite status, and host inspection. Re-read live state before every operation.

## Scope and authority

- OpenShip organization: `org_afbfbb11-78d7-41ee-b644-4b745b486069`.
- The six LingxiLoop projects are Production Docker projects on branch `main`, use local/self-hosted OpenShip source, and have `autoDeploy=false`. The signed post-CI release endpoint performs the fanout.
- OpenShip's health watcher is enabled. The current snapshot is 16/16 healthy with zero outage, zero action-required, zero advisory, and no service drift.
- Server B is the only public application ingress. Server A retains a managed OpenShip Edge for control-plane health but rejects new public-interface TCP connections to 80/443.

## Hosts

| Role | OpenShip name | Server ID | Public IP | WireGuard | SSH alias | Current placement |
| --- | --- | --- | --- | --- | --- | --- |
| A, authoritative state | 上海-A | `f0780369-3b97-4514-9222-6256d9a9acdd` | `182.254.156.84` | `10.20.0.2` | `txy2` | PostgreSQL, Redis, WuKongIM, API-A, AgentOS-A, managed Edge |
| B, only public ingress | 上海-B | `cc10e2e8-8cba-42e1-8ff2-564dc9448f50` | `111.229.65.23` | `10.20.0.3` | `txy` | Edge, API-B, Worker, Gateway, AgentOS-B, Open Notebook, SurrealDB, LingxiLit/OpenLit, ClickHouse, Uptime Kuma |

Capacity at snapshot time:

| Host | RAM total | Available | Swap total/used | Root disk |
| --- | ---: | ---: | ---: | --- |
| A | 3655 MB | 2242 MB | 4095/34 MB | 40 GB, 11 GB used, 26% |
| B | 3655 MB | 1433 MB | 4095/406 MB | 40 GB, 15 GB used, 38% |

Both hosts use a 4 GB `/swapfile4g`. Swap is emergency headroom, not normal capacity.

## Active LingxiLoop release

All six projects run manifest commit `df724bc4228af374bd8b82e8e9b24a887b45286e`. Server, AgentOS, WuKongIM, Open Notebook, and Gateway all use immutable tag `99f2e43cbba78b2ba01dbb9064e0339eac6aad67`. A release must contain all five valid pins, but ordinary component-scoped releases retain valid prior pins for unchanged components.

| Project | ID | Host | Compose | Active deployment | OpenShip version |
| --- | --- | --- | --- | --- | ---: |
| `lingxiloop-core-state` | `proj_khiExWfh7Vsj72VO` | A | `deploy/openship/core-state.yml` | `dep_iT9yKagEJZx5c7Kk` | 2 |
| `lingxiloop-app-a` | `proj_5uz48XlBkfJQeNC8` | A | `deploy/openship/app-a.yml` | `dep_76nu6qPPVvEpHVLg` | 2 |
| `lingxiloop-agent-os-a` | `proj_29J2mM47umuIfaDK` | A | `deploy/openship/agent-os.yml` | `dep_T4c4yznrw7z_g3D4` | 2 |
| `lingxiloop-app-b` | `proj_IsMy2bWVzEZ7JKEf` | B | `deploy/openship/app-b.yml` | `dep_OKH5Ee2REEGuftcD` | 2 |
| `lingxiloop-knowledge-agent` | `proj_frnQUaoQY37ejzL-` | B | `deploy/openship/knowledge-agent.yml` | `dep_jLGk3jFOk99ykWkm` | 2 |
| `lingxiloop-agent-os-b` | `proj_CVkF0rOULikADQ-7` | B | `deploy/openship/agent-os.yml` | `dep_T-G8p8aSNq4nvdY6` | 2 |

LingxiLit, Uptime Kuma, and OpenShip Edge are independently versioned infrastructure and are not part of the LingxiLoop release image set.

## Runtime services

### Server A

| Service | Service ID | Image | Host bind / state | Persistent volume |
| --- | --- | --- | --- | --- |
| PostgreSQL | `svc_FyL3lC1Sp71oiS6V` | `pgvector/pgvector:pg16` | `10.20.0.2:5432` | `openship-lingxiloop-core-state-postgres-data` |
| Redis | `svc_qWhTnJjfGysBCR_1` | `redis:7-alpine` | `10.20.0.2:6379` | `openship-lingxiloop-core-state-redis-data` |
| WuKongIM | `svc_R1qn4zHiKjjfY1An` | `lingxiloop-wukongim:99f2e43...` | `10.20.0.2:5001,5200` | `openship-lingxiloop-core-state-wukong-data` |
| API-A | `svc_Y95Qof0wyIdv7klR` | `lingxiloop-server:99f2e43...` | `10.20.0.2:5181` | none |
| db-migrate A | `svc_9RmMHN7M0K1l5Z_1` | `lingxiloop-server:99f2e43...` | exited 0 | none |
| AgentOS-A | `svc_Q97GKa-vK8cH8O_T` | `lingxiloop-agent-os:99f2e43...` | no host port | `openship-lingxiloop-agent-os-a-agent-os-data` |

### Server B

| Service | Service ID | Image | Host bind / state | Persistent volume |
| --- | --- | --- | --- | --- |
| API-B | `svc_wm0I2fR_uglJGyWb` | `lingxiloop-server:99f2e43...` | loopback `5181` | none |
| Worker-B | `svc_okKRA-wGrqgFyZAk` | `lingxiloop-server:99f2e43...` | no host port | none |
| db-migrate B | `svc_70YEsZbgYP34z7Hv` | `lingxiloop-server:99f2e43...` | exited 0 | none |
| Gateway | `svc_q7ZcH8px3jsB9qnY` | `lingxiloop-gateway:99f2e43...` | `127.0.0.1:8080` | none |
| AgentOS-B | `svc_rT0BSxd8KVNGSWMU` | `lingxiloop-agent-os:99f2e43...` | no host port | `openship-lingxiloop-agent-os-b-agent-os-data` |
| SurrealDB | `svc_yhlLUphCFs8lazC0` | pinned SurrealDB v2 digest | no host port | `openship-lingxiloop-knowledge-agent-surreal-data:/home/nonroot` |
| Open Notebook | `svc_hmGZIaloXJohVV2r` | `lingxiloop-open-notebook:99f2e43...` | `10.20.0.3:5055` | `openship-lingxiloop-knowledge-agent-open-notebook-data` |

Gateway health uses `127.0.0.1`, never `localhost`. SurrealDB stores RocksDB at `/home/nonroot/open-notebook.db`; credentials are supplied by `SURREAL_USER` and `SURREAL_PASS`, not command arguments. Open Notebook uses `https://loop.lingxilearn.cn/internal/open-notebook/v1`.

## Verified behavior

- Both `db-migrate` one-shots exited 0; PostgreSQL contains schema migrations 1, 2, and 3.
- AgentOS heartbeats were 0-1 seconds old for `agent-os-a` and `agent-os-b`; the work queue was empty. The projects differ only in node identity and volume name after excluding node-specific settings.
- Stopping API-A left `loop` healthy through API-B; stopping API-B left it healthy through API-A. Both were restored and healthy.
- Server B reached API-A and WuKongIM over WireGuard; direct and public WuKongIM WebSocket upgrades returned 101.
- Apex, `www`, `loop`, IM, OpenLit, Uptime, Admin, OpenShip, and Wego probes succeeded. Authoritative DNS sends the six DNS-only application names only to Server B; retired origin names are absent.
- Server A public 80/443 are closed while private API/WuKongIM flows remain reachable. Server B remains the public-ingress single point of failure.
- App A's stale Worker/Gateway service rows and containers are absent. Uptime has exactly sixteen active monitors, no inactive or legacy rows, and every latest heartbeat is up.
- Public `https://loop.lingxilearn.cn/api/auth/get-session` returns JSON HTTP 200 through the Gateway; the running Gateway container contains the `/api/auth/` proxy and uses image `99f2e43...`.

## 2026-09-03 first-release reset

OpenShip service-row overrides and non-expanded bind variables caused the historical drift. The checked-in manifests now use explicit private host binds for the fixed production topology, and every service row has been reconciled. App A retains an explicit resolved `10.20.0.2:5181` service bind because OpenShip's upstream-accept path does not expand the Compose variable.

Commit `5d8215c...` split App A and App B into explicit profile-free manifests, removed the old production Compose, Dokploy, and manual deployment paths, restricted the admin topology/deployment feeds to the current production set, and changed CD to synchronize all ten image-bearing service rows before every six-project rollout. Unused historical images were pruned after the verified rollout, reclaiming about 1.15 GB on A and 5.23 GB on B; volumes were not pruned.

Commit `ad9a7f2...` corrected release selection to publish only changed components while requiring a complete immutable five-image set. Workflow `33711770224` promoted Worker version `1c19b8d8-0cb5-4979-a3b4-f25a88c3e14e`, pinned only Gateway to `3b0069a...`, and rolled all six projects to `ready`; OpenShip finished 16/16 healthy with zero issue and zero drift.

Commits `303cedb...` and `99f2e43...` added a main-only manual `release` scope and keyed rollout idempotency by the generated manifest-pin commit. Workflow `33715749321` rebuilt all five images as `99f2e43...`, committed pins as `df724bc...`, and created six distinct OpenShip deployments; all reached `ready` and version 2.

With explicit authorization to discard debugging history, operations stopped only `openship.service`, copied its 57 MB PGlite data directory to `/root/.openship/backups/20260903T1230-openship-pglite`, retained each project's current ready deployment, and reset the six independent counters to version 1. The successful full release then advanced all six together to version 2. The old OpenShip deployment rows are recoverable only from that management-host backup; application data and runtime volumes were untouched.

Changing Open Notebook to the stable `loop` endpoint correctly triggered its stored embedding-contract guard. With explicit no-production-data authorization, operations removed only the Open Notebook and SurrealDB containers and their two named volumes, then redeployed. No backup was created; that old empty Knowledge state is not recoverable. PostgreSQL, Redis, WuKongIM, AgentOS, LingxiLit, and Uptime Kuma data were untouched.

## Host-managed assets

- Server B Edge aliases: `/var/lib/openship/edge/sites-enabled/00-gateway-aliases.conf` and `00-im-gateway.conf`.
- Server A public-ingress fence: enabled systemd unit `/etc/systemd/system/lingxiloop-private-ingress.service`; it rejects new TCP 80/443 on `eth0` and leaves `wg0` private traffic untouched.
- Do not edit OpenShip-generated managed route files.

## Other tracked production projects

- LingxiLit: project `proj_dbXpzANqY8rPvOVC`, independent image `sha-f3017e23cc0a31753b022c64eb40a837f463d627`.
- Uptime Kuma: project `proj_sYmlJeYfdwa4K2bQ`, `always_on`, public status `https://uptime.lingxilearn.cn/status/lingxiloop`.
- WegoLibrary: project `proj_KQmC-0gtQ8DCgHD_`, management-host-local port `18081`, public `golib.christmas1314.xyz`.
- OpenShip management host: SSH alias `aly`, public `ops.christmas1314.xyz`; OpenShip 0.6.9 runs as `openship.service` with its own managed Edge.
