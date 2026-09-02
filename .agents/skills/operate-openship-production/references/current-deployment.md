# Current production deployment

Snapshot: 2026-09-03 01:09 China Standard Time, checked through OpenShip MCP, Wrangler, GitHub CLI, and HTTP probes. Re-read live state before every operation.

## Scope and authority

- OpenShip organization: `org_afbfbb11-78d7-41ee-b644-4b745b486069`.
- The original seven application projects are Production, Docker runtime, branch `main`, local/self-hosted OpenShip source, and have no GitHub installation ID. The six LingxiLoop projects have `autoDeploy=false`; only the signed post-CI release endpoint fans a verified manifest commit out to them. LingxiLit remains manual. Uptime Kuma was added later as an eighth project and is `always_on`; WegoLibrary is a ninth, management-host-local tracker for port `18081`. Re-read metadata rather than assuming every original setting applies.
- Active deployments mostly use `cloneStrategy=api-host` because the destination hosts lack a usable GitHub App/PAT identity. This is slower but not a runtime failure.
- Public ingress and TLS are owned by the OpenShip Edge on Server B. Server A also has an Edge container installed, but it is not the intended public entry.

## Hosts

| Role | OpenShip name | Server ID | Public IP | WireGuard | SSH alias | Current placement |
| --- | --- | --- | --- | --- | --- | --- |
| A, authoritative state | 上海-A | `f0780369-3b97-4514-9222-6256d9a9acdd` | `182.254.156.84` | `10.20.0.2` | `txy2` | PostgreSQL, Redis, WuKongIM, API-A, AgentOS-A, Edge |
| B, only public ingress | 上海-B | `cc10e2e8-8cba-42e1-8ff2-564dc9448f50` | `111.229.65.23` | `10.20.0.3` | `txy` | Edge, API-B, Worker, Gateway, AgentOS-B, Open Notebook, SurrealDB, LingxiLit/OpenLit, ClickHouse |

OpenShip's management host is separate from the two deployment targets: SSH alias `aly`, public IP `47.93.133.55`, and public URL `https://ops.christmas1314.xyz`. It has 2 vCPU, about 1.6 GB RAM, 1 GB swap, and a 40 GB root disk. OpenShip 0.6.9 runs natively as `openship.service`: CLI `/root/.openship/cli/current`, API `127.0.0.1:4000`, dashboard `127.0.0.1:3002`, and `--managed-edge`. The official `openship-edge` container (`ghcr.io/oblien/openship-edge:0.6.9`) owns host `80/443`. PostgreSQL remains `pgsql.service` under `/www/server/pgsql`. Baota Nginx and panel services are masked or disabled and own no public ports. This host is not an OpenShip Docker Compose stack.

Host capacity snapshot:

| Host | RAM total | Available | Swap total/used | Root disk | Docker |
| --- | ---: | ---: | ---: | --- | --- |
| A | 3655 MB | 2108 MB | 4095/18 MB | 40 GB, 12 GB used, 29% | 29.3.1, `overlayfs`, `/var/lib/docker` |
| B | 3655 MB | 1614 MB | 4095/199 MB | 40 GB, 14 GB used, 35% | 29.7.2, `overlayfs`, `/var/lib/docker` |

Both hosts use a 4 GB `/swapfile4g`. Swap is emergency headroom, not normal capacity.

## OpenShip projects

| Project | ID | Group | Host | Compose | Active deployment |
| --- | --- | --- | --- | --- | --- |
| `lingxiloop-core-state` | `proj_khiExWfh7Vsj72VO` | `app_cAckBV8ixw7nDZn1` | A | `deploy/openship/core-state.yml` | `dep_GeAUdSVpldW6LNRD` |
| `lingxiloop-app-a` | `proj_5uz48XlBkfJQeNC8` | `app_4Vx5MywbRUJh9xM1` | A | `deploy/openship/app.yml` | `dep_qlKP1V0lMh0yjsXH` |
| `lingxiloop-agent-os-a` | `proj_29J2mM47umuIfaDK` | `app_Qu5jDwzmWRmSpyAr` | A | `deploy/openship/agent-os.yml` | `dep_C0ox7Sw407lONBtY` |
| `lingxiloop-app-b` | `proj_IsMy2bWVzEZ7JKEf` | `app_j60x6owlFdM2GINr` | B | `deploy/openship/app.yml` | `dep_yOM4BtA2YvqjUPic` |
| `lingxiloop-knowledge-agent` | `proj_frnQUaoQY37ejzL-` | `app_Lbjj7O9yOUrrz2ZR` | B | `deploy/openship/knowledge-agent.yml` | `dep_UiPZycPWNjbjpHAR` |
| `lingxiloop-agent-os-b` | `proj_CVkF0rOULikADQ-7` | `app_z0PWO09lFZzZoN1C` | B | `deploy/openship/agent-os.yml` | `dep_ck_23dItvF6bMiLy` |
| `lingxilit-shanghai-b` | `proj_dbXpzANqY8rPvOVC` | `app_AUYrtzyV0XGDVfd3` | B | `lyyzka/LingxiLit`, `docker-compose.yml` | `dep_mFw8ULd3cELQsl8n` |
| Uptime Kuma | `proj_sYmlJeYfdwa4K2bQ` | `app_YmX74Uqpg6hSf5J_` | B | manually configured Compose | re-read live deployment |

All six LingxiLoop projects reached `ready` from manifest commit `0460841394302f76d679aebc5353cff5ce2b13de`, which pins the five application images built from source commit `524beb46a0a39be3c69c1cd2451b53c35f45dcc6`. The OpenShip health watcher reported 16/16 intended workloads healthy. LingxiLit remains an independent release and still runs application image `sha-f3017e23cc0a31753b022c64eb40a837f463d627`.

## Services

### Server A

| Project/service | Service ID | Enabled | Image actually running | CPU / memory | Host bind | Volume |
| --- | --- | --- | --- | --- | --- | --- |
| core/postgres | `svc_FyL3lC1Sp71oiS6V` | yes | `pgvector/pgvector:pg16` | 1.25 / 768 MB | `10.20.0.2:5432` | `openship-lingxiloop-core-state-postgres-data` |
| core/redis | `svc_qWhTnJjfGysBCR_1` | yes | `redis:7-alpine` | 0.25 / 256 MB | `10.20.0.2:6379` | `openship-lingxiloop-core-state-redis-data` |
| core/wukongim | `svc_R1qn4zHiKjjfY1An` | yes | `lingxiloop-wukongim:ed4d749ce9be62cfd20895b39ac6f5c45c410ecc` | 0.75 / 512 MB | `10.20.0.2:5001,5200` | `openship-lingxiloop-core-state-wukong-data` |
| app-a/db-migrate | `svc_9RmMHN7M0K1l5Z_1` | yes, one-shot | `lingxiloop-server:524beb46...` | 0.5 / 512 MB | none; exited 0 | none |
| app-a/lingxiloop | `svc_Y95Qof0wyIdv7klR` | yes | `lingxiloop-server:53572c0e...` | 0.75 / 448 MB | `10.20.0.2:5181` | none |
| app-a/worker | `svc_F9K5KSm54hoE8sIB` | no | no container | 0.75 / 512 MB if enabled | none | none |
| app-a/gateway | `svc_a09AL2zBgWR8Mk8Q` | no | no container | 0.25 / 64 MB if enabled | would be loopback 8080 | none |
| agent-os-a/agent-os | `svc_Q97GKa-vK8cH8O_T` | yes | `lingxiloop-agent-os:524beb46...` | 1.0 / 768 MB | no host port; container 5190 | `openship-lingxiloop-agent-os-a-agent-os-data` |

WuKongIM also listens inside its container on 5100, 5301, 7000, and 19092; those ports are not published to the host.

### Server B

| Project/service | Service ID | Enabled | Image actually running | CPU / memory | Host bind | Volume |
| --- | --- | --- | --- | --- | --- | --- |
| app-b/db-migrate | `svc_70YEsZbgYP34z7Hv` | yes, one-shot | `lingxiloop-server:524beb46...` | 0.5 / 512 MB | none; exited 0 | none |
| app-b/lingxiloop | `svc_wm0I2fR_uglJGyWb` | yes | `lingxiloop-server:524beb46...` | 0.75 / 448 MB | OpenShip runtime `127.0.0.1:20000 -> 5181` | none |
| app-b/worker | `svc_okKRA-wGrqgFyZAk` | yes | `lingxiloop-server:524beb46...` | 0.75 / 512 MB | none | none |
| app-b/gateway | `svc_q7ZcH8px3jsB9qnY` | yes | `lingxiloop-gateway:53572c0e...` | 0.25 / 64 MB | `127.0.0.1:8080` | none |
| knowledge/surrealdb | `svc_yhlLUphCFs8lazC0` | yes | `surrealdb:v2@sha256:d653f6...` | 0.5 / 512 MB | none | named `...-surreal-data` at `/home/nonroot` plus image-declared anonymous `/data` and `/logs` |
| knowledge/open-notebook | `svc_hmGZIaloXJohVV2r` | yes | `lingxiloop-open-notebook:53572c0e...` | 1.0 / 768 MB | `10.20.0.3:5055` | `openship-lingxiloop-knowledge-agent-open-notebook-data` |
| agent-os-b/agent-os | `svc_rT0BSxd8KVNGSWMU` | yes | `lingxiloop-agent-os:524beb46...` | 1.0 / 768 MB | no host port; container 5190 | `openship-lingxiloop-agent-os-b-agent-os-data` |
| LingxiLit/clickhouse | `svc_tsoqLdyhBVm76TPD` | yes | `clickhouse-server:24.4.1` | 0.75 / 640 MB | no host port; container 8123/9000/9009 | `openship-lingxilit-shanghai-b-clickhouse-data` |
| LingxiLit/openlit | `svc_k2cnIeZumE4FK7AJ` | yes | `lingxilit:sha-f3017e23...` | 0.75 / 512 MB | `127.0.0.1:20001 -> 3000`; private `10.20.0.3:4317,4318` | `openship-lingxilit-shanghai-b-openlit-data` |
| Uptime Kuma/uptime-kuma | `svc_qjjZezA34IpIYDxp` | yes | `louislam/uptime-kuma:1` | no explicit limit at creation | `127.0.0.1:20002 -> 3001` | `uptime_kuma_data:/app/data` |

OpenShip maps API-B and OpenLit to loopback ports 20000 and 20001 for Edge routing even though the Compose-facing service definitions use their container ports. Gateway talks to API-B through the Compose service name, so do not hard-code port 20000 in `gateway.conf`.

## Runtime usage snapshot

| Container | CPU | Memory | Block I/O |
| --- | ---: | ---: | ---: |
| A AgentOS | 0.30% | 132.7 / 768 MiB | 2.7 MB / 197 kB |
| A API | 0.51% | 188.3 / 448 MiB | 688 kB / 3.75 MB |
| A WuKongIM | 3.25% | 132.6 / 512 MiB | 5.84 / 105 MB |
| A Redis | 0.51% | 4.45 / 256 MiB | 901 / 45 kB |
| A PostgreSQL | 0.46% | 47.9 / 768 MiB | 6.41 / 84.1 MB |
| A Edge | 0.01% | 22.8 MiB | 37.4 MB / 520 kB |
| B Gateway | 0.12% | 5.66 / 64 MiB | 4.37 MB / 4 kB |
| B OpenLit | 0.18% | 247.2 / 512 MiB | 179 / 50.2 MB |
| B ClickHouse | 6.37% | 249.2 / 640 MiB | 17.8 / 50.2 MB |
| B AgentOS | 0.26% | 109.6 / 768 MiB | 762 kB / 23.6 MB |
| B Open Notebook | 0.34% | 167.3 / 768 MiB | 8.28 / 36.8 MB |
| B SurrealDB | 4.95% | 63.0 / 512 MiB | 13.3 / 4.38 MB |
| B Worker | 0.30% | 150.8 / 512 MiB | 41 kB / 23 MB |
| B API | 7.60% | 192.8 / 448 MiB | 2.33 / 35.5 MB |
| B Edge | 0.21% | 46.2 MiB | 27.1 MB / 643 kB |

Current image sizes: server 613 MB, AgentOS 706 MB, Open Notebook 490 MB, Gateway 96.7 MB, WuKongIM 137 MB, PostgreSQL 616 MB, Redis 57.3 MB, SurrealDB 116 MB, OpenLit 1.14 GB, ClickHouse 815 MB, Edge 317 MB. A still caches the unused old `lingxiloop-server:ed4...` image at 1.62 GB; it is pruneable only after confirming no stopped container or rollback needs it.

## Live health and coordination

- Health watch is enabled every minute and, after Uptime Kuma was added, reports all 16 expected workloads healthy. The two `db-migrate` containers are stopped with exit `0` but represented as healthy one-shots.
- Both AgentOS workers were at heartbeat age 0 seconds at 22:17 CST: `agent-os-a`, `agent-os-b`.
- The work queue query returned no grouped rows at snapshot time, meaning no queued/leased items existed.
- OpenShip issue feed after the automatic deployments: outage 0, action required 0, advisory 6. All advisories are commit/image update drift across the six LingxiLoop projects; inspect actual images before applying any update.

## Drift and inconsistencies to check first

1. Remote `main` manifest commit `0460841...` pins source image tag `524beb4...`, and every one of the six signed-fanout deployments reached `ready`; this proves CD fanout, not that every locally overridden service row accepted the new tag.
2. WuKongIM still runs `ed4d749c...`, API-A/Open Notebook/Gateway still run `53572c0e...`, and OpenShip reports upstream image drift toward `524beb4...`. These are service-row/Compose sync overrides, not a current outage. Do not blindly accept all drift: WuKongIM also contains a host-port binding difference, Open Notebook contains environment/healthcheck drift, and Knowledge contains a sensitive SurrealDB command-path drift.
3. AgentOS-A/B plus API-B, Worker-B, and both migration one-shots accepted `524beb4...`; verify actual running images after every future signed rollout until the remaining service-row overrides are reconciled deliberately.
4. The live Open Notebook container still has `OPENAI_BASE_URL=https://origin-a.lingxilearn.cn/internal/open-notebook/v1`; the intended stable endpoint is `https://loop.lingxilearn.cn/internal/open-notebook/v1`. Update the project variable and refresh Open Notebook before deleting the legacy origin record.
5. App-A, App-B, Worker-B, AgentOS-A, and AgentOS-B export telemetry over private OTLP/HTTP to `http://10.20.0.3:4318`. A five-node synthetic trace check was present in ClickHouse after the 2026-09-02 rollout.
6. SurrealDB's password is embedded in its effective command and OpenShip returns commands unmasked. Never paste or log that command. Prefer changing the deployment model later so the secret is not exposed in metadata.
7. `deploy/openship/README.md` still says AgentOS-B should reuse the former knowledge-agent volume. Actual production uses `openship-lingxiloop-agent-os-b-agent-os-data`; treat runtime and project environment as authoritative.

## Host asset files on Server B

- Edge: `/var/lib/openship/edge/sites-enabled/00-gateway-aliases.conf`
- Edge: `/var/lib/openship/edge/sites-enabled/00-im-gateway.conf`
- Managed routes: `loop-lingxilearn-cn.conf`, `loop-lingxilearn-cn.route.json`, `openlit-lingxilearn-cn.conf`, `openlit-lingxilearn-cn.route.json`
- LingxiLit assets under `/var/lib/openship/openlit/assets/`: `clickhouse-config.xml`, `clickhouse-init.sh`, `otel-collector-config.yaml`, `pricing.json`

Do not edit OpenShip-generated managed route files. The two `00-*` files are deliberate host-managed aliases documented in the network reference.

## Monitoring project

Uptime Kuma is exposed as `uptime.lingxilearn.cn` through OpenShip domain `dom_KnpiXnifUlWQJrUf`. Its project is `always_on`. Public status page `https://uptime.lingxilearn.cn/status/lingxiloop` contains five groups and sixteen monitors spanning public entry/DNS/TLS, PostgreSQL/Redis/WuKongIM, dependency contract, API-A, shared AgentOS heartbeat, Open Notebook, OpenLit, Uptime, and the OpenShip control plane. The Admin Console monitor targets the owner-confirmed `https://admin.lingxilearn.cn/`; all sixteen monitors were UP at 2026-09-03 01:09 CST. Refine `/status` is deployed in Worker version `d49e6b7e-d2f8-46b6-ac3b-53e575350864`: its protected Worker endpoint reads only Kuma's public status JSON, while each row renders Kuma's own public SVG status badge. The shared AgentOS monitor proves only that at least one worker is alive; it stayed UP while AgentOS-B was temporarily stopped, so individual OpenShip health and both database heartbeat rows remain required for redundancy checks. Monitor URLs are hidden on the public page. API key ID 1 (`dev`) is active and reserved for authenticated Prometheus metrics; its value is never stored in this skill. The SQLite database backups include `/app/data/kuma.db.pre-openship-monitors-20260902184743.bak`, `/app/data/kuma.db.pre-status-page-20260902201452.bak`, `/app/data/kuma.db.pre-finalize-20260902210100.bak`, and `/app/data/kuma.db.pre-api-key-enable-20260902T140428Z.bak`. Do not expose Kuma credentials or database contents. After any control-plane incident or Worker deployment, wait for the next Kuma interval and confirm recovery instead of assuming a successful local curl updates monitoring immediately.

At 22:09 CST, webhook deployment `dep_PZe1CB3mZFJjxjKd` stopped AgentOS-B and stalled while pulling `328990...` from the mirror. It was cancelled, the completed image was started through OpenShip, and AgentOS-B returned healthy with heartbeat age 0. Active deployment remains `dep_MlbbY_uJgbWakRlI`; the cancelled deployment is historical.

## Management-host Wego tracker

WegoLibrary is tracked as OpenShip project `proj_KQmC-0gtQ8DCgHD_` (`framework=docker-compose`, `projectType=docker`, `routeStrategy=loopback-port`, port `18081`, `sleepMode=always_on`) with custom domain `dom_9pGiVkgddoHinLJn`, `golib.christmas1314.xyz`. Its Let's Encrypt YE1 certificate expires 2026-12-01 11:53:39 UTC. The route is stored in `/var/lib/openship/edge/sites-enabled/golib-christmas1314-xyz.conf`; the frontend container proxies `/api` to `backend:8000`. The control-plane route is `/var/lib/openship/edge/sites-enabled/00-ops-control-plane.conf`. Baota's old vhost files remain only as inert rollback material.
