# Uptime Kuma production instance

Snapshot: 2026-09-03 10:34 China Standard Time. Re-read live state before acting.

## Runtime

- OpenShip project: `proj_sYmlJeYfdwa4K2bQ` (`Uptime Kuma`, Production, Docker Compose, `always_on`).
- Service: `svc_qjjZezA34IpIYDxp`, image `louislam/uptime-kuma:1`, Server B `cc10e2e8-8cba-42e1-8ff2-564dc9448f50`.
- Network: container `3001`, host `127.0.0.1:20002`, no direct public host port.
- Data: named `uptime_kuma_data` mounted at `/app/data`.
- Domain: `dom_KnpiXnifUlWQJrUf`, `uptime.lingxilearn.cn`, verified, TLS active, Let's Encrypt YE2 expiry `2026-12-01T09:24:16Z`.
- Public status page: `https://uptime.lingxilearn.cn/status/lingxiloop`.
- Refine view: `https://admin.lingxilearn.cn/status`; its authenticated Worker endpoint reads only published public status JSON, and monitor rows directly render Kuma's official public SVG status badges.

## Coverage

Five groups contain sixteen active monitors:

- Public entry: ICP Website, LingxiLoop Web, Admin Console, Public Gateway, IM TLS Gateway, DNS Resolution.
- Core data/message: PostgreSQL, Redis, WuKongIM, Dependency Contract.
- API/Agent: API-A, shared AgentOS heartbeat.
- Knowledge/observability: Open Notebook, OpenLit.
- Operations: Uptime Kuma self-check, OpenShip control plane.

After the first-release reset, OpenShip reported 16/16 healthy with zero issue or drift, and the public Kuma status page returned HTTP 200. The local authenticated metrics key was unavailable for this check, so no claim is made about a fresh `/metrics` scrape. Monitor URLs are hidden from the public page.

The shared AgentOS monitor checks `agentOs=true` from the dependency endpoint, which means at least one worker heartbeat is fresh. It remained UP during a temporary AgentOS-B deployment outage. Always combine it with OpenShip's per-service health and a database query confirming both `agent-os-a` and `agent-os-b` heartbeat ages; both were 0 seconds after recovery at 22:17 CST.

## API key and backups

- API key row: ID `1`, name `dev`, active, no expiry. Never store or display its plaintext value.
- The key is for Prometheus `GET /metrics` only. Use HTTP Basic with an empty username and the key as password.
- Relevant SQLite backups:
  - `/app/data/kuma.db.pre-openship-monitors-20260902184743.bak`
  - `/app/data/kuma.db.pre-status-page-20260902201452.bak`
  - `/app/data/kuma.db.pre-finalize-20260902210100.bak`
  - `/app/data/kuma.db.pre-api-key-enable-20260902T140428Z.bak`

## Production domains

- DNS-only A to `111.229.65.23`: `lingxilearn.cn`, `www.lingxilearn.cn`, `loop.lingxilearn.cn`, `im.lingxilearn.cn`, `openlit.lingxilearn.cn`, `uptime.lingxilearn.cn`.
- Approved production exception: `admin.lingxilearn.cn` is a Cloudflare Worker Custom Domain and resolves to Cloudflare A/AAAA addresses.
- `origin-a.lingxilearn.cn`, `origin-b.lingxilearn.cn`, `origin.loop.lingxilearn.cn`, and `ops.lingxilearn.cn` are absent.
- Open Notebook now uses `https://loop.lingxilearn.cn/internal/open-notebook/v1`; no legacy origin record is needed.

## Verification caveat

The workstation's configured HTTP(S) proxy can make curl report remote IP `127.0.0.1` and reset only the Uptime connection. Server B direct checks returned HTTP 200 for Uptime root, status page, and both public JSON endpoints; OpenShip health also reported the service healthy.
