# Current production deployment

Snapshot: 2026-09-03 10:34 China Standard Time, checked through OpenShip MCP, GitHub CLI, authoritative DNS, HTTP/WebSocket probes, and host inspection. Re-read live state before every operation.

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
| A | 3655 MB | 2164 MB | 4095/35 MB | 40 GB, 17 GB used, 42% |
| B | 3655 MB | 1220 MB | 4095/406 MB | 40 GB, 20 GB used, 50% |

Both hosts use a 4 GB `/swapfile4g`. Swap is emergency headroom, not normal capacity.

## Active LingxiLoop release

All six projects run manifest commit `f02ce00e72ead6743646979d31b659fb8e4fa04a`. Every LingxiLoop-owned image uses the last complete five-image cohort `b42fef160fe697d46a8818e054f945d1f80953f7`; a later partial cohort was not used because Gateway, Open Notebook, and WuKongIM tags did not exist.

| Project | ID | Host | Compose | Active deployment |
| --- | --- | --- | --- | --- |
| `lingxiloop-core-state` | `proj_khiExWfh7Vsj72VO` | A | `deploy/openship/core-state.yml` | `dep_iwo-MqsxP67r-hoI` |
| `lingxiloop-app-a` | `proj_5uz48XlBkfJQeNC8` | A | `deploy/openship/app.yml` | `dep_TSHb2V3tuZZyPg0V` |
| `lingxiloop-agent-os-a` | `proj_29J2mM47umuIfaDK` | A | `deploy/openship/agent-os.yml` | `dep_T_OVA-RV0bjrtELT` |
| `lingxiloop-app-b` | `proj_IsMy2bWVzEZ7JKEf` | B | `deploy/openship/app.yml` | `dep_vKEdZ18EBjRg6aJb` |
| `lingxiloop-knowledge-agent` | `proj_frnQUaoQY37ejzL-` | B | `deploy/openship/knowledge-agent.yml` | `dep_Kc4eqjfeLBSUYFly` |
| `lingxiloop-agent-os-b` | `proj_CVkF0rOULikADQ-7` | B | `deploy/openship/agent-os.yml` | `dep_8RPd_DfaUERoNBxf` |

LingxiLit, Uptime Kuma, and OpenShip Edge are independently versioned infrastructure and are not part of the LingxiLoop image cohort.

## Runtime services

### Server A

| Service | Service ID | Image | Host bind / state | Persistent volume |
| --- | --- | --- | --- | --- |
| PostgreSQL | `svc_FyL3lC1Sp71oiS6V` | `pgvector/pgvector:pg16` | `10.20.0.2:5432` | `openship-lingxiloop-core-state-postgres-data` |
| Redis | `svc_qWhTnJjfGysBCR_1` | `redis:7-alpine` | `10.20.0.2:6379` | `openship-lingxiloop-core-state-redis-data` |
| WuKongIM | `svc_R1qn4zHiKjjfY1An` | `lingxiloop-wukongim:b42fef1...` | `10.20.0.2:5001,5200` | `openship-lingxiloop-core-state-wukong-data` |
| API-A | `svc_Y95Qof0wyIdv7klR` | `lingxiloop-server:b42fef1...` | `10.20.0.2:5181` | none |
| db-migrate A | `svc_9RmMHN7M0K1l5Z_1` | `lingxiloop-server:b42fef1...` | exited 0 | none |
| AgentOS-A | `svc_Q97GKa-vK8cH8O_T` | `lingxiloop-agent-os:b42fef1...` | no host port | `openship-lingxiloop-agent-os-a-agent-os-data` |

### Server B

| Service | Service ID | Image | Host bind / state | Persistent volume |
| --- | --- | --- | --- | --- |
| API-B | `svc_wm0I2fR_uglJGyWb` | `lingxiloop-server:b42fef1...` | loopback `5181` | none |
| Worker-B | `svc_okKRA-wGrqgFyZAk` | `lingxiloop-server:b42fef1...` | no host port | none |
| db-migrate B | `svc_70YEsZbgYP34z7Hv` | `lingxiloop-server:b42fef1...` | exited 0 | none |
| Gateway | `svc_q7ZcH8px3jsB9qnY` | `lingxiloop-gateway:b42fef1...` | `127.0.0.1:8080` | none |
| AgentOS-B | `svc_rT0BSxd8KVNGSWMU` | `lingxiloop-agent-os:b42fef1...` | no host port | `openship-lingxiloop-agent-os-b-agent-os-data` |
| SurrealDB | `svc_yhlLUphCFs8lazC0` | pinned SurrealDB v2 digest | no host port | `openship-lingxiloop-knowledge-agent-surreal-data:/home/nonroot` |
| Open Notebook | `svc_hmGZIaloXJohVV2r` | `lingxiloop-open-notebook:b42fef1...` | `10.20.0.3:5055` | `openship-lingxiloop-knowledge-agent-open-notebook-data` |

Gateway health uses `127.0.0.1`, never `localhost`. SurrealDB stores RocksDB at `/home/nonroot/open-notebook.db`; credentials are supplied by `SURREAL_USER` and `SURREAL_PASS`, not command arguments. Open Notebook uses `https://loop.lingxilearn.cn/internal/open-notebook/v1`.

## Verified behavior

- Both `db-migrate` one-shots exited 0; PostgreSQL contains schema migrations 1, 2, and 3.
- AgentOS heartbeats were 0-1 seconds old for `agent-os-a` and `agent-os-b`; the work queue was empty. The projects differ only in node identity and volume name after excluding node-specific settings.
- Stopping API-A left `loop` healthy through API-B; stopping API-B left it healthy through API-A. Both were restored and healthy.
- Server B reached API-A and WuKongIM over WireGuard; direct and public WuKongIM WebSocket upgrades returned 101.
- Apex, `www`, `loop`, IM, OpenLit, Uptime, Admin, OpenShip, and Wego probes succeeded. Authoritative DNS sends the six DNS-only application names only to Server B; retired origin names are absent.
- Server A public 80/443 are closed while private API/WuKongIM flows remain reachable. Server B remains the public-ingress single point of failure.

## 2026-09-03 first-release reset

OpenShip service-row overrides and non-expanded bind variables caused the historical drift. The checked-in manifests now use explicit private host binds for the fixed production topology, and every service row has been reconciled. App A retains an explicit resolved `10.20.0.2:5181` service bind because OpenShip's upstream-accept path does not expand the Compose variable.

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
