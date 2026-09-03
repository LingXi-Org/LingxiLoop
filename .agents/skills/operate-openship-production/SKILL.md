---
name: operate-openship-production
description: Inspect, deploy, upgrade, recover, and audit LingxiLoop's two-server OpenShip production environment and its separate OpenShip control-plane host, including live project/service/deployment IDs, Compose profiles and stale service rows, AgentOS affinity, environment consistency, WireGuard/private ports, the single-ICP-IP Gateway, DNS/TLS and Edge aliases, Cloudflare Workers, LingxiLit/OpenLit, Uptime Kuma, Docker storage recovery, volumes, image drift, and historical deployment failures. Use whenever work touches deploy/openship, OpenShip MCP, production variables or secret sources, Server A or B, the management host, lingxilearn.cn, production images, host cleanup, capacity, failover, or incident response.
---

# Operate LingxiLoop OpenShip Production

Use the existing two-server architecture and inspect live state before changing it. The reference snapshot records everything learned during the 2026-09-01/02 deployment session, but OpenShip and the hosts are the authority for current runtime state.

## Read the right references

- Always read [references/current-deployment.md](references/current-deployment.md) before inspecting or changing production.
- Read [references/environment-contract.md](references/environment-contract.md) before editing any project, service, GitHub Actions, Worker, or local secret-file environment.
- Read [references/domains-and-network.md](references/domains-and-network.md) for DNS, TLS, Edge, Gateway, firewall, WireGuard, WebSocket, or ingress work.
- Read [references/operations-and-history.md](references/operations-and-history.md) for upgrades, cleanup, recovery, known traps, destructive rebuilds, and architecture rationale.
- Read [references/deployment-ledger.md](references/deployment-ledger.md) only when tracing or comparing historical OpenShip deployments.
- Read [references/uptime-kuma.md](references/uptime-kuma.md) for monitoring, the public status page, metrics PAT use, backups, and Refine integration.

Use the references as one audit set. The original snapshot covered seven application projects; Uptime Kuma and the management-host WegoLibrary tracker were added afterward as the eighth and ninth projects. Cover project, service, deployment, domain, image, volume, and server identities; environment equality and secret provenance; DNS/TLS/private-network routing; upgrades, destructive recovery, and failure history; and the complete deployment ledger. Do not infer a current value from a historical ID or assume recorded counts remain current.

## Separate fact classes

Label every finding as `current runtime`, `desired manifest`, `historical`, or `unresolved`. Never turn a historical action into standing permission or a desired value into a claim about production.

Re-check these end-of-session exceptions explicitly instead of assuming they were later resolved:

- `im.lingxilearn.cn` was the final manual DNS-only A-record switch; prove its authoritative A/AAAA/CNAME state before claiming completion.
- A later snapshot still found an old `origin-a` Open Notebook upstream; compare the project environment, service row, and running container with the intended `loop` callback.
- OpenShip reported service/image drift after otherwise successful deployments; compare the running image digest or immutable tag, not just the active deployment status.
- The SurrealDB service command could contain an unmasked password. Redact commands and arguments before reporting or storing them.

## Preserve these invariants

1. Server B (`111.229.65.23`, WireGuard `10.20.0.3`) is the only public ingress permitted for retained `lingxilearn.cn` hostnames because of ICP access requirements.
2. Server A (`182.254.156.84`, WireGuard `10.20.0.2`) owns PostgreSQL, Redis, and WuKongIM. These remain single-primary failure domains; never claim whole-platform automatic failover.
3. API-A and API-B are active-active behind the Server B Gateway. AgentOS-A and AgentOS-B pull work independently with PostgreSQL leases, fences, worker heartbeats, session affinity, and Home epochs.
4. Do not add a Redis router, AgentOS Gateway, `run_id -> node` forwarding layer, Kafka, Kubernetes, two-node etcd/Patroni/Sentinel, DNS round-robin, or public AgentOS port.
5. AgentOS `5190`, SurrealDB, ClickHouse, PostgreSQL, Redis, Open Notebook, and OTLP are never public. OpenShip Edge alone terminates public `80/443` on Server B.
6. Run schema migrations before new Web/Worker/AgentOS binaries. Confirm the applied chain includes `0003_agent_os_session_affinity` and every later migration. Treat `db-migrate` exiting `0` as a successful one-shot, not an outage.
7. Keep `agent-os-a` and `agent-os-b` unique, set `AGENT_OS_NODE_TIMEOUT_SECONDS=15`, and keep both at `AGENT_OS_MAX_CONCURRENT_RUNS=1` until measured headroom justifies `2 + 2`. A hard failure can wait for the existing 45-second lease; never promise live-process migration or recovery of unpersisted local state, and use a new Home epoch after takeover.
8. Keep APIs free of the retired `AGENT_OS_URL`/`AGENT_OS_ENDPOINTS`; API health comes from shared PostgreSQL worker heartbeats. Keep AgentOS out of the Knowledge project and never publish host port `5190`.
9. Never print, commit, copy into a patch, or summarize plaintext credentials. Record secret names and equality requirements only. Treat `D:\Documents\OpenShip\*.txt` as local secret sources, not repository artifacts, and map values by the manifest keys that consume them rather than by filename. Let the configured OpenShip MCP transport supply its PAT; never read or copy it from Codex configuration. Validate authentication with a harmless `get_issues_health` call.
10. Preserve named volumes unless the user explicitly authorizes exact destructive targets. The SurrealDB reset and later Server B Docker data-root rebuild were authorized because there was no production data; neither is standing permission.
11. On the `aly` management host, public `80/443` belongs to the `openship-edge` container. Baota's `nginx.service`, `bt.service`, `site_total.service`, and `BT-FirewallServices.service` remain disabled or masked; do not revive them for routing.
11. Preserve intentional service roles: App A runs Web only; App B runs Web, Worker, and Gateway; migrations are one-shots; Knowledge runs only SurrealDB and Open Notebook; each AgentOS project runs one node; LingxiLit runs OpenLit and ClickHouse.
12. Do not control a browser. Use OpenShip MCP, host-safe commands, `wrangler`, DNS CLI, and HTTP/WebSocket probes. If Wrangler lacks ordinary DNS-record permission, report the exact manual record change.
13. Treat the OpenShip control-plane host (`aly`, `47.93.133.55`) separately from A/B. OpenShip 0.6.9 runs there as native `openship.service`, not a Docker Compose stack. Preserve `pgsql.service` under `/www/server/pgsql` and the `openship-edge` container; keep Baota `nginx.service`, `bt.service`, and collector services disabled or masked.

## Inspect before acting

Use this order:

1. Read the org-wide OpenShip issues feed and cached health watch. Confirm `watching=true`; an empty incident list without the watcher is not evidence of health.
2. List live projects and reconcile them with the seven-project snapshot. For each, read project metadata, project environment, service rows, running containers, active deployment, and domains; do not assume the count stayed seven.
3. Compare four layers independently:
   - repository Compose/image tag;
   - OpenShip project environment;
   - OpenShip service row, domain binding, and reported drift;
   - actual container image, ports, mounts, and environment.
4. Treat the actual container as runtime truth and drift as unresolved until a refresh deploy is verified. OpenShip service overrides can outlive Compose changes.
5. Check both hosts with targeted commands: `docker ps -a`, `docker stats --no-stream`, `docker volume ls`, `free -m`, `swapon --show`, `df -h /`, and concise `docker info` formatting.
6. On 4 GB Server B, never run `docker system df -v` during normal service: its metadata scan previously drove `dockerd` above 3 GB RSS and caused SSH loss.
7. On the 1.6 GB control-plane host, inspect `openship.service`, `pgsql.service`, `nginx.service`, Docker log drivers, `site_total.service`, and per-process I/O independently. Do not infer that every process on that host belongs to OpenShip.
8. Never delete `overlay2`, containerd, or Docker data-root contents while Docker is running. Use a declared maintenance window and exact validated paths if storage must be rebuilt.
9. Query `agent_os_workers` and the work queue without exposing database credentials. Both worker heartbeats must be fresh; an idle or empty queue does not replace heartbeat validation.
10. For DNS, distinguish the intended record set, authoritative DNS, resolver propagation, OpenShip verification, Edge routing, and certificate state. Do not infer one from another.
11. Treat `${...}` in a service environment as unresolved configuration, not a valid value. Compare shared API/Worker keys for equality without printing secrets.

## Change and deploy

For LingxiLoop releases:

1. Keep GitHub-push `autoDeploy=false` on all six LingxiLoop projects. A push must not reach production before CI gates and immutable images finish.
2. Confirm CI built immutable SHA images for server, AgentOS, WuKongIM, Open Notebook, and Gateway, then committed their pins through `scripts/update-deployment-images.mjs`.
3. After D1 migration and the exact Worker Version are promoted, let CI send the HMAC-signed release request to `/api/internal/releases`; the Worker first synchronizes the App A/B Web service rows from `OPENSHIP_APP_TARGETS` to the pinned server image, then fans the manifest commit out to the six configured OpenShip project IDs through `/api/proxy/api/deployments`.
4. Treat OpenShip `202 Accepted` without a deployment ID as accepted, then use OpenShip to verify all six resulting deployments reach `ready`; never equate HTTP acceptance with completion.
5. Run the PostgreSQL migration first.
6. Deploy API-A and API-B with the same server image. App A enables only Web; App B enables `worker,gateway`.
7. Verify both APIs separately before Gateway balancing.
8. Deploy AgentOS-A and AgentOS-B with the same image, unique worker IDs, one slot, and their own actual named volumes.
9. Deploy knowledge services only after the shared callback/origin environment is correct.
10. Deploy LingxiLit independently from `lyyzka/LingxiLit`; it is not a LingxiLoop service image. Preserve the 640 MB ClickHouse and 512 MB OpenLit limits unless live capacity justifies a reviewed change.
11. Refresh or patch explicit OpenShip service rows when upstream Compose sync does not update the image. Re-read drift and the running image afterward.
12. Never use a simple restart to apply changed environment; OpenShip can return `SERVICE_CONFIG_STALE`. Use a refresh deployment for the affected service.
13. Reconcile removed services and profile changes explicitly. OpenShip may retain a stale Worker, Gateway, AgentOS, container, or service row after Compose no longer selects it.
14. Detach an old public domain before changing its service port to a private bind; OpenShip domain bindings previously forced WuKongIM back to a loopback/public mapping.
15. Keep Gateway in the CI-built immutable image. OpenShip did not support its relative bind mount reliably. Keep its health check on `127.0.0.1`, not `localhost`, because Alpine resolved the latter to IPv6 while Nginx listened on IPv4.
16. Normalize host-mounted shell and initialization files to LF before starting Linux containers; CRLF made the LingxiLit ClickHouse initializer exit `126`.

## Configure Better Auth production

Keep authentication on the existing control-plane Worker. Use Better Auth's native Email OTP and CAPTCHA plugins; do not deploy a separate Siteverify Worker or add a second authentication service.

1. Treat `VITE_TURNSTILE_SITE_KEY` as public build configuration. Keep `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, and `RESEND_FROM` as Worker secrets set only with `wrangler secret put`; never place them in Wrangler vars, GitHub variables, logs, patches, or repository files.
2. Configure the Turnstile widget in managed mode for `admin.lingxilearn.cn` and `loop.lingxilearn.cn`. Keep `workers_dev` disabled, declare `admin.lingxilearn.cn` as the Worker custom domain, and include both hosts in `AUTH_ALLOWED_HOSTS`.
3. When the available Cloudflare credential can only create API tokens, use it solely as a local bootstrap credential: create a short-lived child token restricted to the target account and `Turnstile Sites Write`, create or update the widget, rotate/capture its secret, upload the Worker secret, and revoke the child token in a `finally` path. Never deploy either API token.
4. Keep the public sitekey in the production build environment. Prefer the GitHub `production` environment variable when repository permissions allow it; otherwise a checked-in public sitekey in the workflow is acceptable. Never apply that exception to the secret key.
5. Apply D1 migrations before `control:deploy`. A Wrangler result of `No targets deployed` is not success: require the output to list `admin.lingxilearn.cn (custom domain)` and record the deployed version ID.
6. Verify the built assets contain the intended public sitekey, `/` returns `200`, `/api/health` succeeds, and the Worker secret inventory contains the required names without reading their values. Test a real OTP only with the requested recipient; never print the OTP. CAPTCHA solving remains an interactive user action.

If local Wrangler incorrectly discovers an unrelated ancestor Yarn PnP manifest, deploy from an isolated temporary directory containing the Worker source, built assets, root TypeScript config, and a junction to this repository's `node_modules`. Validate the exact temporary path before cleanup; do not change dependencies or commit a workaround for a machine-local resolver problem.

For domains, route only `loop.lingxilearn.cn` directly through the Gateway service row. Route apex and `www` to the bundled ICP landing site, `loop` to API-B plus private API-A, and `im` to Server A WuKongIM over WireGuard. Apex, `www`, and `im` require the documented host Edge aliases because this OpenShip version retains only one Compose custom domain per service.

## Operate Uptime Kuma

- Let the configured OpenShip MCP transport supply its PAT. Supply the Kuma key only through `UPTIME_KUMA_API_KEY`; never place either secret in commands, patches, logs, URLs, Worker variables, or repository files.
- The Kuma key is metrics-only. Run `node .agents/skills/operate-openship-production/scripts/check-uptime-metrics.mjs`; it uses `GET /metrics` with an empty Basic-auth username and prints aggregate state only.
- Use authenticated Socket.IO/UI for monitor changes. An emergency SQLite edit requires explicit authorization, an online `.backup`, a transaction, and public API verification.
- Verify the root, public status page and JSON, latest monitor heartbeats, OpenShip health, `https://admin.lingxilearn.cn/status`, and an unauthenticated `401` from `/api/control/status-page`.
- Keep the project `always_on`, container port `3001` bound to host loopback, TLS on OpenShip Edge, monitor URLs hidden, and `/app/data` preserved.

## Recover capacity safely

1. Distinguish running-container memory from image-layer, volume, log, and host-directory usage. Shared image sizes cannot be added per container.
2. Prefer targeted filesystem and image inventories. Never repeat the known-dangerous full Docker metadata scan on Server B.
3. Remove only confirmed stopped containers, unused images, and build caches during normal cleanup. Never include volumes without fresh explicit authorization and a verified backup/data classification.
4. If stale layerdb metadata prevents normal pruning, schedule downtime, record the exact services and images needed for recovery, stop Docker/containerd, validate the exact data-root paths, rebuild storage, and redeploy from immutable images. Never hand-delete individual live layer directories.
5. Verify the post-session Server B baseline rather than assuming it: Docker 29.7.2 with containerd `overlayfs`, no BT Panel `/www` stack, and only required production data. Treat any deviation as a current finding.

## Verify before handoff

Require all applicable checks:

- OpenShip issues: no outage or action-required item; explain any advisory.
- Health watch: every intended long-running service healthy; every existing migration container absent or stopped with exit `0`; App A's Worker/Gateway and other profile-excluded rows remain intentionally disabled.
- Runtime images: both APIs equal; both AgentOS instances equal; expected immutable SHA actually running.
- Environment: API-A/B differ only in node-specific project values; AgentOS differs only in worker ID and volume name; no API has `AGENT_OS_URL`; knowledge and AgentOS callbacks use `loop`.
- AgentOS: both heartbeats fresh, no unexpected leased work, `5190` absent from host/public ports.
- Gateway: `/healthz` returns `204`; apex/site, loop API, WebSocket/streaming, and IM upgrade work.
- Failover: stop or isolate each API one at a time and prove `loop` still serves through the other before declaring API redundancy.
- DNS: `lingxilearn.cn`, `www`, `loop`, `im`, and `openlit` resolve only to `111.229.65.23`, with no AAAA/CNAME/proxy; `admin` resolves through Cloudflare to the control-plane Worker; `origin-a`, `origin-b`, `ops`, and `origin.loop` legacy names are absent.
- TLS: every retained hostname has the intended active certificate and a renewal path on Server B.
- Network: Server A public `80/443` closed; only explicitly listed WireGuard flows work.
- Worker: `admin.lingxilearn.cn` is the only Refine/admin URL and the workers.dev route is disabled; health/login/API proxy, D1 migrations, Turnstile, Email OTP, and the `https://ops.christmas1314.xyz` upstream work.
- LingxiLit: OpenLit and ClickHouse healthy within limits; OTLP remains private; host assets exist and use LF line endings.
- Capacity: memory, swap, disk, CPU, and block I/O remain within the recorded 4C4G envelope.
- Management host: `ops.christmas1314.xyz` and `golib.christmas1314.xyz` are served by `openship-edge`; Wego frontend and its `/api` backend proxy both work; Baota Nginx and panel stay stopped.

Report current facts separately from target configuration and unresolved drift. Never hide the single-ingress and single-state-host limitations.

If live production changed, update the applicable references in this skill before the final response, excluding all secret values, then validate this skill directory.
