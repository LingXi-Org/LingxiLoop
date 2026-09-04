# Current production deployment

Snapshot: 2026-09-04 15:46 China Standard Time, checked through OpenShip MCP, GitHub Actions, HTTP probes, database queries, and targeted container inspection. Re-read live state before every operation.

## Scope and authority

- OpenShip organization: `org_afbfbb11-78d7-41ee-b644-4b745b486069`.
- The six LingxiLoop projects are Production Docker projects on branch `main`, use local/self-hosted OpenShip source, and have `autoDeploy=false`. The signed post-CI release endpoint performs the fanout.
- OpenShip's health watcher is enabled. The current snapshot is 16/16 healthy with zero outage and zero action-required. Six advisory-only source comparisons do not report unhealthy workloads.
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

All six projects run manifest commit `6ca0ed8d7dce575d8e6d690cad74e22185cf4bed`. The component-scoped release rebuilt only Server with immutable tag `9a1531d9c72fa29a75a7241ac218889293f3ad0b`; AgentOS remains at `0cfa406...`, and WuKongIM, Open Notebook, and Gateway retain their valid prior pins.

| Project | ID | Host | Compose | Active deployment | OpenShip version |
| --- | --- | --- | --- | --- | ---: |
| `lingxiloop-core-state` | `proj_khiExWfh7Vsj72VO` | A | `deploy/openship/core-state.yml` | `dep_SroReJYwM66_3qmm` | 9 |
| `lingxiloop-app-a` | `proj_5uz48XlBkfJQeNC8` | A | `deploy/openship/app-a.yml` | `dep_N_SbUu1LwAejQpeK` | 9 |
| `lingxiloop-agent-os-a` | `proj_29J2mM47umuIfaDK` | A | `deploy/openship/agent-os.yml` | `dep_fwT7DLSS167aDTzj` | 9 |
| `lingxiloop-app-b` | `proj_IsMy2bWVzEZ7JKEf` | B | `deploy/openship/app-b.yml` | `dep_eGYLoMAs41Bemn3f` | 9 |
| `lingxiloop-knowledge-agent` | `proj_frnQUaoQY37ejzL-` | B | `deploy/openship/knowledge-agent.yml` | `dep_RVG__LlUZtMXyLZb` | 9 |
| `lingxiloop-agent-os-b` | `proj_CVkF0rOULikADQ-7` | B | `deploy/openship/agent-os.yml` | `dep_HPgGozF_N3cqm3K3` | 9 |

LingxiLit, Uptime Kuma, and OpenShip Edge are independently versioned infrastructure and are not part of the LingxiLoop release image set.

## Runtime services

### Server A

| Service | Service ID | Image | Host bind / state | Persistent volume |
| --- | --- | --- | --- | --- |
| PostgreSQL | `svc_FyL3lC1Sp71oiS6V` | `pgvector/pgvector:pg16` | `10.20.0.2:5432` | `openship-lingxiloop-core-state-postgres-data` |
| Redis | `svc_qWhTnJjfGysBCR_1` | `redis:7-alpine` | `10.20.0.2:6379` | `openship-lingxiloop-core-state-redis-data` |
| WuKongIM | `svc_R1qn4zHiKjjfY1An` | `lingxiloop-wukongim:7f16f69...` | `10.20.0.2:5001,5200` | `openship-lingxiloop-core-state-wukong-data` |
| API-A | `svc_Y95Qof0wyIdv7klR` | `lingxiloop-server:9a1531d...` | `10.20.0.2:5181` | none |
| db-migrate A | `svc_9RmMHN7M0K1l5Z_1` | `lingxiloop-server:9a1531d...` | exited 0 | none |
| AgentOS-A | `svc_Q97GKa-vK8cH8O_T` | `lingxiloop-agent-os:0cfa406...` | no host port | `openship-lingxiloop-agent-os-a-agent-os-data` |

### Server B

| Service | Service ID | Image | Host bind / state | Persistent volume |
| --- | --- | --- | --- | --- |
| API-B | `svc_wm0I2fR_uglJGyWb` | `lingxiloop-server:9a1531d...` | loopback `5181` | none |
| Worker-B | `svc_okKRA-wGrqgFyZAk` | `lingxiloop-server:9a1531d...` | no host port | none |
| db-migrate B | `svc_70YEsZbgYP34z7Hv` | `lingxiloop-server:9a1531d...` | exited 0 | none |
| Gateway | `svc_q7ZcH8px3jsB9qnY` | `lingxiloop-gateway:7f16f69...` | `127.0.0.1:8080` | none |
| AgentOS-B | `svc_rT0BSxd8KVNGSWMU` | `lingxiloop-agent-os:0cfa406...` | no host port | `openship-lingxiloop-agent-os-b-agent-os-data` |
| SurrealDB | `svc_yhlLUphCFs8lazC0` | pinned SurrealDB v2 digest | no host port | `openship-lingxiloop-knowledge-agent-surreal-data:/home/nonroot` |
| Open Notebook | `svc_hmGZIaloXJohVV2r` | `lingxiloop-open-notebook:7f16f69...` | `10.20.0.3:5055` | `openship-lingxiloop-knowledge-agent-open-notebook-data` |

Gateway health uses `127.0.0.1`, never `localhost`. SurrealDB stores RocksDB at `/home/nonroot/open-notebook.db`; credentials are supplied by `SURREAL_USER` and `SURREAL_PASS`, not command arguments. Open Notebook uses `https://loop.lingxilearn.cn/internal/open-notebook/v1`.

## Verified behavior

- Prompt-contract source commit `0cfa406...` is included in the active Server and AgentOS images. Both AgentOS containers run that image and directly report `PROMPT_CONTRACT_VERSION = 'prompt-v6'`. The contract requires `loop.chat.ask` for blocking questions and native Host actions for explicit product operations.
- A user chat turn was accepted, completed by AgentOS, and persisted with its final reply in WuKongIM, but the browser discarded that canonical message when it had missed the transient stream preview. Server tag `c9324ff...` removes that preview dependency: durable final messages now reconcile directly after stream gaps or reconnects. API-A/API-B and Worker-B run the new image healthy; public `/api/health` returns 200 and OpenShip reports 16/16 healthy.
- Both `db-migrate` one-shots exited 0; PostgreSQL contains schema migrations 1 through 4. Migration 4 backfilled all active personal-company owners into `participants`; the post-rollout gap query returned zero.
- AgentOS heartbeats were 0-1 seconds old for `agent-os-a` and `agent-os-b`; the work queue was empty. The projects differ only in node identity and volume name after excluding node-specific settings.
- Stopping API-A left `loop` healthy through API-B; stopping API-B left it healthy through API-A. Both were restored and healthy.
- Server B reached API-A and WuKongIM over WireGuard; direct and public WuKongIM WebSocket upgrades returned 101.
- Apex, `www`, `loop`, IM, OpenLit, Uptime, Admin, OpenShip, and Wego probes succeeded. Authoritative DNS sends the six DNS-only application names only to Server B; retired origin names are absent.
- Server A public 80/443 are closed while private API/WuKongIM flows remain reachable. Server B remains the public-ingress single point of failure.
- App A's stale Worker/Gateway service rows and containers are absent. Uptime has exactly sixteen active monitors, no inactive or legacy rows, and every latest heartbeat is up.
- Public `https://loop.lingxilearn.cn/api/auth/get-session` returns JSON HTTP 200 through the Gateway. Anonymous `/api/session` reaches the control-plane authentication layer and returns JSON HTTP 401; public `/api/health` remains HTTP 200 through the signed Worker-to-origin bypass. The running Gateway uses image `7f16f69...` and reuses its TLS connections to the Worker; its local `/healthz` returned 204.

## 2026-09-03 control-plane latency repair

Unsigned browser API requests were paying a fresh Server B-to-Cloudflare TLS handshake plus unconditional D1 auth initialization on every route. Commit `dd717dd...` added the Gateway's reusable HTTP/1.1 TLS upstream, limited Better Auth/session middleware to routes that require it, cached the small auth-settings row for 60 seconds, enabled Better Auth's signed 60-second cookie cache for ordinary business traffic, retained forced database session validation for `/api/control/*`, and enabled Smart Placement. Workflow `33753015826` promoted Worker version `90f18aca-a7ed-4e70-be2c-6756bfa2a5a0`, published Gateway `dd717dd...`, and rolled manifest `e129d84...` to all six projects at version 6.

After warm-up, ten public samples from the operator path measured median TTFB of 77 ms for HTML, 454 ms for `/api/health`, 812 ms for `/api/auth/get-session`, and 305 ms for an anonymous protected API rejection. Before repair, comparable API medians were about 1.5-1.7 seconds. The remaining occasional outliers are on the public China-to-Cloudflare path; Server B's local API remained 3-5 ms.

## 2026-09-03 first-release reset

OpenShip service-row overrides and non-expanded bind variables caused the historical drift. The checked-in manifests now use explicit private host binds for the fixed production topology, and every service row has been reconciled. App A retains an explicit resolved `10.20.0.2:5181` service bind because OpenShip's upstream-accept path does not expand the Compose variable.

Commit `5d8215c...` split App A and App B into explicit profile-free manifests, removed the old production Compose, Dokploy, and manual deployment paths, restricted the admin topology/deployment feeds to the current production set, and changed CD to synchronize all ten image-bearing service rows before every six-project rollout. Unused historical images were pruned after the verified rollout, reclaiming about 1.15 GB on A and 5.23 GB on B; volumes were not pruned.

Commit `ad9a7f2...` corrected release selection to publish only changed components while requiring a complete immutable five-image set. Workflow `33711770224` promoted Worker version `1c19b8d8-0cb5-4979-a3b4-f25a88c3e14e`, pinned only Gateway to `3b0069a...`, and rolled all six projects to `ready`; OpenShip finished 16/16 healthy with zero issue and zero drift.

Commits `303cedb...` and `99f2e43...` added a main-only manual `release` scope and keyed rollout idempotency by the generated manifest-pin commit. Workflow `33715749321` rebuilt all five images as `99f2e43...`, committed pins as `df724bc...`, and created six distinct OpenShip deployments; all reached `ready` and version 2.

With explicit authorization to discard debugging history, operations stopped only `openship.service`, copied its 57 MB PGlite data directory to `/root/.openship/backups/20260903T1230-openship-pglite`, retained each project's current ready deployment, and reset the six independent counters to version 1. The successful full release then advanced all six together to version 2. The old OpenShip deployment rows are recoverable only from that management-host backup; application data and runtime volumes were untouched.

Changing Open Notebook to the stable `loop` endpoint correctly triggered its stored embedding-contract guard. With explicit no-production-data authorization, operations removed only the Open Notebook and SurrealDB containers and their two named volumes, then redeployed. No backup was created; that old empty Knowledge state is not recoverable. PostgreSQL, Redis, WuKongIM, AgentOS, LingxiLit, and Uptime Kuma data were untouched.

## 2026-09-03 Alibaba Mail OTP cutover

At 13:15 China Standard Time, the control-plane Worker served version `200f827c-d73f-4f1f-9e7a-c75fe15f3c40` at 100% traffic. OTP and password-reset mail now use TLS SMTP on `smtp.qiye.aliyun.com:465`, authenticating as `no-reply@lingxilearn.cn`; the feedback mailbox credentials for `support@lingxilearn.cn` are also stored as a Worker secret for later product use. Both accounts authenticated successfully, Alibaba SMTP accepted a test delivery from no-reply to support, and POP3 confirmed receipt without exposing message content or credentials. The unused Worker `RESEND_API_KEY` and `RESEND_FROM` secrets were removed; App A/B Resend configuration for the independent agent-email subsystem was not changed.

The Worker custom domain, admin root, admin health, and loop health returned HTTP 200 after deployment. OpenShip remained 16/16 healthy with the watcher enabled. D1 had no pending migrations.

At 13:42, Worker tail proved the original line-oriented secret upload caused Alibaba SMTP `526 Authentication failure`; rewriting both mailbox secrets with JSON `wrangler secret bulk` produced version `8c8933b2-4426-4a5d-a678-03a529bb5496` and a real OTP request completed without exceptions. PR `#14` then committed the SMTP implementation and merged as `a2e032393ac6692134c9b8cc2c35009e495a3fed`. The QQ recipient still reported no delivery; the sender mailbox had no bounce, while an Alibaba-delivered copy proved the generated message lacked `Date` and `Message-ID`.

PR `#15` added both standard headers and merged as `eaee369baebbb04a0087ab57fc99074422ba2275`. GitHub Actions run `33721478814` passed and promoted tagged Worker version `92525f1e-711e-400c-8c94-003877d6f554` at 100% traffic. One post-CD OTP request for the sole unverified QQ account returned `200` with no Worker exception, and an independent no-reply delivery reached the authorized Tencent test mailbox in about 12 seconds. Public health endpoints remained `200`, and OpenShip's watcher remained enabled with 16/16 services healthy.

## 2026-09-03 login session routing repair

Successful browser sign-ins were creating D1 session rows, but the Gateway routed only `/api/auth/` to the control-plane Worker. The app's immediate `/api/session` bootstrap request therefore reached Express directly, returned `404`, and caused `AuthGate` to clear its local state. PR `#17` routed all browser `/api/` traffic through the Worker while sending Worker-signed origin requests directly to the dual API upstream. GitHub Actions run `33725928050` published Gateway image `d794d15db8cd011ca9c776686a09e17aa66fb628`; manifest commit `9ec63f07eef4d2b305da579c698d097775ef8794` reached `ready` on all six projects at OpenShip version 3. Post-rollout probes returned `401` JSON for anonymous `/api/session`, `200` for `/api/auth/get-session`, and `200` for `/api/health`.

## Host-managed assets

- Server B retains only the host-managed IM alias `/var/lib/openship/edge/sites-enabled/00-im-gateway.conf`; apex and `www` are OpenShip-managed static routes.
- Server A public-ingress fence: enabled systemd unit `/etc/systemd/system/lingxiloop-private-ingress.service`; it rejects new TCP 80/443 on `eth0` and leaves `wg0` private traffic untouched.
- Do not edit OpenShip-generated managed route files.

## Other tracked production projects

- Landing page: project `proj_zLjrHA6Bb8KurSS_`, static deployment `dep_5QEIBHtbiE16mLlU` at commit `d1b98ab2cfe6f3e2277430d8a32c808c2005ff69`, serving `lingxilearn.cn` with `www` redirected to apex.
- LingxiLit: project `proj_dbXpzANqY8rPvOVC`, independent image `sha-f3017e23cc0a31753b022c64eb40a837f463d627`.
- Uptime Kuma: project `proj_sYmlJeYfdwa4K2bQ`, `always_on`, public status `https://uptime.lingxilearn.cn/status/lingxiloop`.
- WegoLibrary: project `proj_KQmC-0gtQ8DCgHD_`, management-host-local port `18081`, public `golib.christmas1314.xyz`.
- OpenShip management host: SSH alias `aly`, public `ops.christmas1314.xyz`; OpenShip 0.6.9 runs as `openship.service` with its own managed Edge.
