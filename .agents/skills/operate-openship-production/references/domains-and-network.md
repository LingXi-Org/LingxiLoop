# Domains, Edge, Gateway, and private network

## Intended public DNS

Because the Tencent Cloud ICP access record permits `lingxilearn.cn` only on Server B, every retained hostname must be a DNS-only A record to `111.229.65.23`:

| Hostname | Purpose | Runtime target |
| --- | --- | --- |
| `lingxilearn.cn` |备案/static website | App B Gateway `8080` |
| `www.lingxilearn.cn` | redirect to apex | App B Gateway/Edge redirect |
| `loop.lingxilearn.cn` | dual-API product origin | App B Gateway `8080` |
| `im.lingxilearn.cn` | WuKongIM WSS | App B Gateway `8080` -> A `10.20.0.2:5200` |
| `openlit.lingxilearn.cn` | LingxiLit/OpenLit | OpenLit container `3000` through Edge |
| `uptime.lingxilearn.cn` | Uptime Kuma and public status page | Uptime Kuma container `3001` through Edge |

For those five names, remove AAAA, CNAME, and Cloudflare-proxy records. Remove obsolete `origin-a.lingxilearn.cn`, `origin-b.lingxilearn.cn`, `origin.loop.lingxilearn.cn`, and `ops.lingxilearn.cn` records. OpenShip uses `ops.christmas1314.xyz`.

The owner later restored `admin.lingxilearn.cn` as the primary Refine/admin Cloudflare Worker Custom Domain and kept Workers.dev as a fallback. At the 2026-09-02 check it resolved to Cloudflare A/AAAA addresses and returned HTTP 200 from Server B and an external client. This is an explicit exception to the earlier "all `lingxilearn.cn` names terminate on the备案 IP" target; do not silently remove it or claim the DNS-only invariant still covers `admin`. The same audit found the legacy `origin-a.lingxilearn.cn` Cloudflare record still present because the live Open Notebook container still uses it. Refresh Open Notebook to the intended `loop` upstream and verify it before manually deleting this record with DNS credentials that have record-write scope.

## Current OpenShip domain objects

Snapshot 2026-09-02:

| Domain | ID | Project/service | State | Certificate |
| --- | --- | --- | --- | --- |
| `loop.lingxilearn.cn` | `dom_O5vpPZIQhCOzmEQw` | App B / Gateway `svc_q7ZcH8px3jsB9qnY`, port 8080 | primary, verified, active | Let's Encrypt YE1, expires 2026-12-01 07:46:51 UTC |
| `lingxilearn.cn` | `dom_k1hZTRzL_Ki9KePm` | App B project object, no service ID | verified, active | YE1, expires 2026-12-01 08:18:00 UTC |
| `www.lingxilearn.cn` | `dom_nMKMWyXWUKJL6PGu` | App B project object, 301 to apex | verified, active | YE1, expires 2026-12-01 08:18:32 UTC |
| `im.lingxilearn.cn` | `dom_jicSJwEDrwItddbl` | App B project object, manual Edge target | verified, active | YE1, expires 2026-12-01 08:40:41 UTC |
| `openlit.lingxilearn.cn` | `dom_yZP6Jg6nj_Q1_kl9` | LingxiLit / OpenLit `svc_k2cnIeZumE4FK7AJ`, port 3000 | primary, verified, active | YE1, expires 2026-12-01 08:08:47 UTC |
| `uptime.lingxilearn.cn` | `dom_KnpiXnifUlWQJrUf` | Uptime Kuma / `svc_qjjZezA34IpIYDxp`, port 3001 | verified, active | YE2, expires 2026-12-01 09:24:16 UTC |

Historical/deleted domain objects:

- `dom_Hzvfeo4lDYZY0Wv0`: `origin-a.lingxilearn.cn` -> API-A 5181.
- `dom_AXuiPWlfXmEAXWtN`: `origin-b.lingxilearn.cn` -> API-B 5181.
- `dom_QX--127Q527P6iD-`: former Server A `im.lingxilearn.cn` -> WuKongIM 5200.
- `dom_XDPEY4hprmyZq2h-`: former App B `loop.lingxilearn.cn` -> API-B 5181; replaced by the Gateway-bound object.

`dom_cua` and `dom_index_module` appeared only as regex false positives in raw tool/code text and are not OpenShip domain IDs.

## Propagation caveat

OpenShip's 17:48 CST health snapshot considered all five retained domains verified and reported no action-required domain issue. A local resolver check shortly afterward still returned:

- apex, `www`, `loop`, and `openlit` -> `111.229.65.23`;
- `im` -> the old Server A public IP `182.254.156.84`;
- `admin` and `origin-a` -> Cloudflare proxy A/AAAA addresses;
- no useful result for `origin-b`, `origin.loop`, or `ops`.

Direct queries to `1.1.1.1` timed out from the workstation. Therefore do not treat either snapshot as conclusive. Query the authoritative nameservers and at least one independent resolver before closing Server A ingress or deleting certificates. The target state remains the table above.

## Gateway behavior

Checked-in `deploy/openship/gateway.conf`:

- listens on container port 8080;
- exposes host loopback `127.0.0.1:8080` only;
- `/healthz` returns 204;
- serves `website/` for apex and `www`;
- balances `loop` with `least_conn` between `lingxiloop:5181` on App B and `10.20.0.2:5181` on App A;
- forwards Host, X-Forwarded headers, WebSocket Upgrade/Connection, disables response/request buffering, and gives streaming a 3600-second timeout;
- retries API upstream errors/timeouts/invalid headers/502/503/504 with two tries;
- proxies `im` to `10.20.0.2:5200` with WebSocket support and 3600-second timeouts;
- uses Docker DNS resolver `127.0.0.11` for the local Compose service.

The Gateway image is built from `nginx:alpine`, copies `gateway.conf`, and copies repository `website/` to `/usr/share/nginx/html`.

Use `127.0.0.1`, not `localhost`, in the Gateway health check. Alpine/wget selected IPv6 for `localhost` in the failed version, while Nginx listened on IPv4, causing a false unhealthy state. Commit `9fe3cc645e2998c6201c737d4e4e2db2699cd423` fixed this root cause.

## OpenShip Edge aliases

The current OpenShip release preserves only the first Compose custom domain on a service. `loop` is the service-managed Gateway route. Apex, `www`, and `im` use host-managed Edge configuration on Server B:

- `/var/lib/openship/edge/sites-enabled/00-gateway-aliases.conf` proxies apex to `127.0.0.1:8080` and redirects `www` to apex.
- `/var/lib/openship/edge/sites-enabled/00-im-gateway.conf` proxies HTTP/HTTPS IM traffic to `127.0.0.1:8080` with WebSocket timeouts.

Do not edit `loop-lingxilearn-cn.conf` or `openlit-lingxilearn-cn.conf`; OpenShip generates them.

For the initial cutover, Server A's valid IM certificate (YE2, expiring 2026-11-30) was copied to `/etc/letsencrypt/manual/im.lingxilearn.cn/{fullchain.pem,privkey.pem}` on B with modes 0644/0600. After DNS verification, Server B obtained a fresh YE1 certificate expiring 2026-12-01 08:40:41 UTC. Ensure the manual IM Edge file follows the renewed certificate path and has an automated or documented renewal/reload path.

Certbot 2.8.0 was installed on Server B because the first OpenShip certificate attempt failed with `certbot: command not found`. After any manual change run Edge's `openresty -t` and reload only if the check passes.

OpenShip Edge 0.6.9 cannot pull `ghcr.io/oblien/openship-edge:0.6.9` directly due registry denial on these hosts. It runs through `accel.way2api.fun/ghcr.io/oblien/openship-edge:0.6.9` on B; A currently has the direct cached image. The `0.6.9 -> 0.6.9` update advisory is a mirror-comparison false positive, not a service outage.

## Network allowlist

Public Server B:

- 22/tcp only from administrator source ranges;
- 80/tcp and 443/tcp for OpenShip Edge.

Server A should expose no public 80/443 after authoritative DNS is confirmed. Restrict SSH similarly.

Private WireGuard flows:

| Source | Destination | Port | Purpose |
| --- | --- | ---: | --- |
| B | A `10.20.0.2` | 5181 | API-A upstream |
| B | A `10.20.0.2` | 5001 | WuKongIM API |
| B | A `10.20.0.2` | 5200 | WuKongIM WebSocket |
| B | A `10.20.0.2` | 5432 | PostgreSQL |
| B | A `10.20.0.2` | 6379 | Redis |
| A | B `10.20.0.3` | 5055 | Open Notebook |
| A/B services, when telemetry is enabled | B `10.20.0.3` | 4317/4318 | OTLP gRPC/HTTP |

Never host-publish AgentOS 5190, SurrealDB 8000, or ClickHouse 8123/9000/9009. OpenLit port 3000 remains loopback-routed by OpenShip.

## Validation commands and expectations

Before DNS cutover, probe Server B directly:

```sh
curl --resolve lingxilearn.cn:443:111.229.65.23 https://lingxilearn.cn/
curl --resolve loop.lingxilearn.cn:443:111.229.65.23 https://loop.lingxilearn.cn/api/health
curl --resolve openlit.lingxilearn.cn:443:111.229.65.23 https://openlit.lingxilearn.cn/
```

Expected: apex 200, `www` redirects to apex then 200, loop health 200, OpenLit login 200, valid TLS. A plain HTTP-style GET to the IM WebSocket endpoint may return 400; a valid upgrade request must return `101 Switching Protocols` and then remain open.

After cutover:

1. Query authoritative A/AAAA/CNAME records for all retained and legacy names.
2. Probe each public hostname without `--resolve`.
3. Stop API-A, prove `loop` serves through API-B; restore it.
4. Stop API-B, prove `loop` serves through API-A; restore it.
5. Test long streaming responses and WebSocket reconnect, not only short HTTP health.
6. Verify B can reach every allowed private A port and A can reach B 5055.
7. Confirm public scans cannot reach PostgreSQL, Redis, WuKongIM API, Open Notebook, AgentOS, SurrealDB, ClickHouse, or OTLP.
8. Only then close Server A public 80/443.

Server B remains a public-ingress single point of failure. API and AgentOS redundancy does not change that limitation.

## Management-host edge

The separate `aly` host (`47.93.133.55`) uses the official `openship-edge:0.6.9` container on host `80/443`. `ops.christmas1314.xyz` proxies every path to the loopback Dashboard `127.0.0.1:3002`; the Dashboard's `/api/proxy/*` handler is the only public API/MCP path. `golib.christmas1314.xyz` proxies to Wego frontend `127.0.0.1:18081`, whose own Nginx sends `/api` to `backend:8000`. Both hostnames resolve to `47.93.133.55`. Baota Nginx and panel services stay disabled or masked. Do not import all historical Baota vhosts into the Edge: doing so would re-expose retired panel, Memos, and unrelated services.
