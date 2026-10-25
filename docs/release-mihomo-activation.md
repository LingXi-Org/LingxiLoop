# Exact optional Mihomo activation proposal (#495)

Prepared only. No binary was installed, no subscription was entered, and no
host network or Docker configuration was changed.

## Fixed artifact and scope

Official release selected on 2026-10-25: [MetaCubeX/mihomo v1.19.33](https://github.com/MetaCubeX/mihomo/releases/tag/v1.19.33),
published 2026-10-21. Use the conservative x86-64 artifact
`mihomo-linux-amd64-compatible-v1.19.33.gz` on A/B after confirming their actual
architecture. The official GitHub release API reports compressed size
22,893,972 bytes and SHA-256
`386508bfb1c72c43b6a0eda73708ecdce82546581b0ebcb16366c53757c622b6`.
Download over verified HTTPS, verify this compressed digest before extraction,
and record the extracted binary digest before installing it at
`/usr/local/bin/mihomo`. Do not run an unverified binary or bootstrap through a
proxy container.

Proposed targets are only A `182.254.156.84` and B `111.229.65.23`. The native
service is `lingxi-release-mihomo.service`, user `lingxi-release-proxy`, with
loopback mixed listener `127.0.0.1:17890`, no LAN, TUN, DNS interception or
external controller. The immutable local policy is
`/etc/lingxi-release/mihomo.yml`; a separately validated node-only provider is
stored at `/etc/lingxi-release/secrets/mihomo-provider.yaml`, 0600, and loaded
with systemd credentials. Keep the previous validated provider until the
candidate passes authenticated registry manifest and actual blob/CDN checks.
Subscription refresh and service activation are separate operations.

The importer in `scripts/mihomo/refresh.mjs` validates candidates in a private
0700 staging directory and preserves the previous provider on failure. Its
output is a JSON provider (valid YAML); transfer only that provider through the
approved credential path. The service uses the fixed host policy template,
never the subscription's listeners, DNS, routing, scripts or control API.

## Proposed Docker daemon change and maintenance impact

Inspect and preserve the actual daemon configuration and current service
states first. The proposed effective daemon proxy values are:

```json
{
  "proxies": {
    "http-proxy": "http://127.0.0.1:17890",
    "https-proxy": "http://127.0.0.1:17890",
    "no-proxy": "localhost,127.0.0.1,::1,10.20.0.0/24,postgres,redis,lingxiloop,worker,wukongim,open-notebook"
  }
}
```

Merge only these proxy fields into the actual `/etc/docker/daemon.json` if
that is the installed daemon's configuration path. Preserve all existing
storage, network, logging, security and live-restore settings. Validate the
candidate with the installed `dockerd --validate` when supported. The provided
systemd drop-in is an alternative for engines without daemon proxy keys; do
not install both or assume the drop-in overrides existing JSON proxies.
[Docker documents that daemon configuration takes precedence and that a
restart is needed](https://docs.docker.com/engine/daemon/proxy/).

This is a host-wide proxy for daemon registry requests. It is not a proxy for
business container traffic, separate BuildKit builders, Git or Tunnel. Those
actors require their own fixed settings and actual tests. Canonical public
registry requests are proxied; private service endpoints remain direct.

One Docker restart on each target host is proposed, separately and inside the
approved migration maintenance window. Read-only host inventory subsequently
confirmed A Docker 29.3.1 with live-restore enabled and B Docker 29.7.2 with
live-restore disabled. B therefore requires planning for container shutdown;
A's setting is not a guarantee of uninterrupted availability without an actual
controlled validation. On A this can affect PostgreSQL, Redis, WuKongIM and app A; on B it
can affect shared ingress, Notebook/SurrealDB, app B, monitoring, landing and
LingxiLit. Preserve the named and anonymous data volumes in `release-access.md`.
Do not begin this restart until the actual inventory, recovery artifacts,
write drain and unrelated-service impact are explicitly accepted. Do not
restart Docker on ordinary future releases or whenever the proxy is unhealthy.

Rollback preserves a copy of the prior exact daemon configuration. Restore it,
validate it, reload systemd only if a drop-in changed, and perform the necessary
controlled daemon restart once; then verify all prior containers, images,
volumes, readiness and public routes. Restore the previous provider and stop
only the newly installed proxy service when appropriate. Do not prune images,
remove networks/volumes, or change unrelated project definitions. Without a
usable subscription, do not activate the daemon proxy.

## Real safe subscription input

The configured Sigillo service is `https://sigillo.lingxilearn.cn`. Its root
web page returned HTTP 403 from this executor, so a working browser form is
not claimed. The installed, authenticated **Sigillo 0.14.2 CLI** is verified;
its help explicitly supports a masked prompt when `secrets set` omits the
value. In the user's own trusted terminal, use the existing authenticated
Sigillo configuration and run:

```sh
sigillo --api-url https://sigillo.lingxilearn.cn projects
sigillo --api-url https://sigillo.lingxilearn.cn secrets set MIHOMO_SUBSCRIPTION_URL -p <resolved-project-id> --env prod
sigillo --api-url https://sigillo.lingxilearn.cn secrets set MIHOMO_SUBSCRIPTION_ORIGIN -p <resolved-project-id> --env prod
```

Choose the unique project **LingxiLoop Control Plane** (the current read-only
lookup resolves `01M1TZH9C21C1A9PFAR8E41553`; re-resolve at execution). Enter
the full subscription URL only in the first masked prompt. Enter only its
HTTPS origin in the second prompt. Do not place either value in command
arguments, chat, repository files or screenshots. The agent later receives the
value only through the existing `sigillo run ... -- <fixed helper>` injection
with output redaction retained; it checks presence and the approved origin
without printing the secret.

This proposal needs separate action-specific approval from the first
executor/Tunnel/credential/backend group. The missing subscription is not
invented, and a reachability-only probe does not count as an authenticated
registry/blob acceptance result.
