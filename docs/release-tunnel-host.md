# Dedicated release Tunnel connector bootstrap

This module provides finite production commands for the sole integrator. It has not been executed on production. It creates no Cloudflare resource, token, DNS record or Access policy and does not modify any existing cloudflared installation, tunnel, Docker configuration or business service.

## Official immutable version

Verified on 2026-10-25: the official [GitHub latest-release API](https://api.github.com/repos/cloudflare/cloudflared/releases/latest) reports `2026.10.3`, published 2026-10-21. Both the asset `digest` and release-body checksum specify the Linux amd64 binary SHA-256:

`053b80b0a23031a038fdbf3c073f59f82b8f1f152aa67971d7383ffafc0dbab0`

The installer downloads only the [fixed official release binary](https://github.com/cloudflare/cloudflared/releases/download/2026.10.3/cloudflared-linux-amd64), verifies its bytes and exact `cloudflared version 2026.10.3` output before promotion. Redirects are limited to HTTPS GitHub release-asset origins. No credential accompanies the download. The real binary download/version execution has not been run by this contributor; host installation verifies both.

## Finite command/data interface

Read `scripts/release/bootstrap-host/tunnel.py` as the Python source for the existing finite Komodo transport. Use the same shell quoting function as the existing bootstrap builders:

```js
const command = `python3 -c ${quote(tunnelSource)} ${quote(JSON.stringify(data))}`
```

The only accepted JSON fields are:

```json
{
  "action": "query",
  "host": "a",
  "tunnelId": "00000000-0000-0000-0000-000000000000",
  "origin": "http://127.0.0.1:17951",
  "remoteConfigSha256": "0000000000000000000000000000000000000000000000000000000000000000"
}
```

Replace the example UUID/hash with actual verified non-secret values. `host` is exactly `a` or `b`; the existing trusted transport maps that label to the exact server. `remoteConfigSha256` is the SHA-256 of the integrator's canonical, read-back-verified Cloudflare Tunnel configuration. It is recorded as the approval identity, not independently fetched by this host module. The remotely managed Tunnel's actual ingress must already map only its approved release-a/release-b hostname to `http://127.0.0.1:17951`, followed by the deny catch-all, with the approved restricted Access policy. The host module does not have or request a Cloudflare management credential. It cannot locally assert that remote ingress or Access is correct.

Allowed actions:

- `query`: read-only receipt, pending intent, binary/unit hashes, current pointer and bounded systemd state. Run first after any uncertain result. `connectedVerified:false` explicitly means an active process is not proof of Cloudflare connectivity or an authenticated executor route.
- `install`: fixed private binary `/opt/lingxi-release-tunnel/versions/2026.10.3/cloudflared`; atomic `/opt/lingxi-release-tunnel/current`; only unit `/etc/systemd/system/lingxi-release-tunnel.service`. No enable/start/restart, no token creation or mutation. A running dedicated service must be explicitly stopped by the integrator before an upgrade; the installer refuses to do that itself.
- `start`: verify the matching installation receipt, exact binary/unit hashes and existing token identity, persist a start intent, daemon-reload and start **only** `lingxi-release-tunnel.service`. If the service is already active, verify its own unit FragmentPath and positive MainPID and reconcile without repeating start. It does not enable boot startup.
- `enable`: separately authorized by the parent. Requires the own installation receipt and hashes, existing matching credential, and an active own service. Persists enable intent, enables only `lingxi-release-tunnel.service` if not already enabled, and verifies `UnitFileState=enabled`. It does not start or stop anything.

No input can select an executable, download URL, file path, service name, command, alternate port or token literal. Mutation commands take an exclusive fixed module lock. Query is read-only and may observe an in-progress promotion; a failed query is not evidence that a previous action did nothing.

## Credentials and service isolation

The only credential source is the existing root-owned 0600 file `/etc/lingxi-release/secrets/tunnel-token`. The module checks its base64 JSON Tunnel identity `t` against the approved UUID without returning the token. Its digest binds installation/start to the existing secret. Changing the credential or approved remote configuration requires a separately reviewed update; it is not silently absorbed by replay.

The unit uses systemd `LoadCredential=tunnel-token:/etc/lingxi-release/secrets/tunnel-token` and `run --token-file %d/tunnel-token`, supported by the [official run parameters](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/). No token is put in argv, environment or logs. `DynamicUser=yes` runs the connector without a persistent root account; dedicated public binary directories are traversable, while receipts/intents are 0600. The separate `/opt/lingxi-release-tunnel` root avoids changing permissions of `/opt/lingxi-release` and its existing executor installation.

The connector explicitly uses `/dev/null` as its local config to avoid importing another cloudflared service's configuration. It disables binary autoupdate, clears inherited proxy/token environment variables for this service only, restricts its diagnostics listener to an ephemeral loopback port, and has no dependency on Komodo, the executor, Mihomo or any business service. Process stdout/stderr are discarded; module output is limited to public identities, hashes and bounded systemd properties. No global systemd manager environment, network, firewall, DNS, existing tunnel, daemon proxy or `/usr/bin` binary is modified. `daemon-reload` reloads definitions but does not restart other services.

## Unknown outcomes and owned upgrades

Installation stages and verifies the binary and unit before persisting `intent-2026.10.3.json`. The intent records exact binary/unit/token hashes, approved identity and prior pointer/unit hash. Only then does promotion install the version, atomically install the unit and atomically replace `current`, followed by `install-2026.10.3.json`. An interrupted promotion resumes only if all existing staged/final identities match its intent. No partial version is accepted without an intent.

Upgrading an existing connector requires its prior version's own installation receipt, exact previous binary/unit hashes, approved Tunnel/remote-config identity and unchanged token digest; unowned services, binaries, units or differing files are rejected. Previous version directories and receipts are retained. Unknown start/enable results are reconciled from their persisted intents and current systemd state before any duplicate effect. The module does not delete old resources, reset tunnel identities or retry by reinstalling.

Local verification: `node --test scripts/release/bootstrap-host/tunnel.test.mjs` runs seven Python actor regressions with temporary paths and mocked downloads/systemd: immutable install/idempotence; current-switch crash/query/replay; lost start/enable response without duplicate effects; unowned unit/partial version/corrupt binary refusal; active upgrade/input allowlist/drift refusal; receipt-owned upgrade; existing token identity/private mode. No production action was executed. Cloudflare connection health, Access rejection/allow rules and authenticated executor health remain the integrator's live acceptance checks.

## Bounded download and independent progress queries

After an actual installation stream timed out at 180 seconds, the module was tightened without retrying or changing that production attempt. The previous per-socket 60-second timeout was not a total download deadline: redirects or a slowly progressing stream could exceed the transport budget.

New commands enforce a 90-second wall-clock deadline for the entire download and a 120-second wall-clock deadline for the complete install action using Linux `ITIMER_REAL`. This includes DNS, redirects, blocking reads and installation work, rather than resetting the budget per chunk. Nested timers restore the enclosing remaining budget; an interrupted install retains staging/intent evidence for query. These bounds apply to commands running the updated source; they do not stop an older installation process already running on the host. Start/enable behavior is unchanged.

Read-only `query` now also returns:

```json
{
  "staging": { "count": 1, "bytes": 123456 },
  "installationLock": { "present": true, "busy": true }
}
```

Staging totals use directory and regular-file metadata only, never file contents; they are a live sample, not a completion proof. Lock inspection opens only an existing `.lock` read-only with no-follow and attempts nonblocking flock. It never creates a lock, changes permissions or waits for the installer. An absent lock reports `present:false`; an inaccessible/unsafe lock reports `busy:null` and `queryError:"unavailable"`, which must not be treated as permission to retry.

Use a separate query terminal without the operator write lock to observe a potentially blocked installation terminal. An unknown installation remains prohibited from replay until the integrator reconciles its process, lock, pending intent and any receipt. If a receipt exists, the original host/Tunnel/config identity and binary/unit/current hashes are still mandatory checks; the extra progress fields do not weaken them.

Three focused actor cases were added: progress/lock sampling leaves file contents, permissions and mtime unchanged; existing receipts reject a different original identity; simulated slow download and slow install hit total deadlines without a current pointer/final receipt. All ten Python actor cases pass locally. No production request or retry was executed for this fix.
