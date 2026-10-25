# Release access and proxy preparation (#495)

This is a preparation record, not permission to mutate production. No credentials, Tunnel, proxy, Docker daemon settings or production resources were created or changed. Observation: 2026-10-25 10:47 UTC, through existing Sigillo `prod` injection and canonical `https://ops.christmas1314.xyz` read APIs. Recheck after the previous publisher hands off; it was still active during preparation.

## Verified baseline

`ListUsers` succeeded (administrator-only API); servers manager/shanghai-a/shanghai-b are `Ok`, aly is `Disabled`; all eight stacks are `running`. The `lingxiloop-production-rollout` procedure is `Failed`, not a successful release receipt. No new release receipt was requested.

`https://loop.lingxilearn.cn/api/meta` returned HTTP 200, commit `197e2568d46de349bb3ce0a26aefbadaae8f4723`, runtime `3.8.12`, schema `14`. `/api/health` and `/api/health/dependencies` returned HTTP 200/ok, database/Redis/Open Notebook true. Both application Web and Worker containers were running/healthy with image ID `sha256:5827fbcbf7be6306e3ed4d129bfb89fde18901c62310474689a6768853eae649`, tagged with that commit. This image ID is the inspected container image, not a claimed registry manifest digest. Both stack configuration commits were `3f7e5e85d0b77311be64f877078288626aafe567`; configuration is not proof of deployed version. The one-off migration containers were exited at older `d1075e35e16721979b484c2d9e33eeb56468ce9d`; that alone does not prove installed schema provenance.

| Resource | Exact ID | Treatment proposed after replacement acceptance |
| --- | --- | --- |
| lingxiloop-app-a | 6aa8a411b35d27bdd4e12aef | Retire publisher-managed stack; retain homes |
| lingxiloop-app-b | 6aa8a414b35d27bdd4e12af1 | Retire publisher-managed stack; retain homes |
| lingxiloop-core-state | 6aa8a3e8b35d27bdd4e12ae0 | Retire controller ownership only; retain live state |
| lingxiloop-knowledge-agent | 6aa8a3ebb35d27bdd4e12ae2 | Retire controller ownership only; retain live state |
| lingxiloop-production-rollout | 6aa8a416b35d27bdd4e12af5 | Disable/retire old release entry point after handoff |
| server-b-ingress | 6aa8a3a0b35d27bdd4e12acd | Keep shared ingress; not approved for retirement |
| uptime | 6aa8a415b35d27bdd4e12af3 | Keep monitoring/data |
| landing | 6aa8a3e6b35d27bdd4e12ade | Keep independent project |
| lingxilit | 6aa8a3edb35d27bdd4e12ae4 | Keep independent project |
| manager | 6ad11a22d8838102d0fa5f5e | Keep Core/bootstrap host |
| shanghai-a | 6aa8a1bcb35d27bdd4e12a26 | Keep shared host |
| shanghai-b | 6aa8a1b9b35d27bdd4e12a24 | Keep shared host |
| aly | 6aa8a1b5b35d27bdd4e12a21 | Keep disabled record and independent wegolibrary |

Do not delete a stack record until the replacement controller's ownership and no-container-destruction semantics are reviewed. The table is an exact proposed scope, not authorization. Irrecoverable deletion is excluded by default. Keep Core procedures `Backup Core Database` (`6aa89b90775d6e01dfed18e2`), `Global Auto Update` (`6aa89b90775d6e01dfed18e4`) and `Rotate Server Keys` (`6aa89b90775d6e01dfed18e6`); separately inspect whether global scheduling can touch LingxiLoop before handoff.

Live `InspectContainer` mount names to preserve:

- shanghai-a: `lingxiloop-core-state_postgres-data`, `lingxiloop-core-state_redis-data`, `lingxiloop-core-state_wukong-data-20261002-v2`, `lingxiloop-app-a_lingxios-homes`.
- shanghai-b: `lingxiloop-app-b_lingxios-homes`, `lingxiloop-knowledge-agent_open-notebook-data`, `lingxiloop-knowledge-agent_surreal-data`, `server-b-ingress_traefik-acme`, `uptime_uptime-data`.
- SurrealDB anonymous volumes: `6b835985fd4a959fe6970df2577d8e0daf27136f09cea85acdc8d30bd4cb879c` at `/data`, `03e147730324f497b0ef0e4f75eddd1b78636d511c92d65f7db5caf095f0a38d` at `/logs`. Preserve both; a named volume alone is not a full data inventory.
- Reference-only bootstrap inventory (not independently host-inspected): txy3 `komodo_mongo-data`, `komodo_mongo-config`, `komodo_keys`, `control-ingress_traefik-acme`, `/etc/komodo/backups`; aly `/opt/apps/wegolibrary`, `aly-ingress_traefik-acme`, retained old Core/keys/backups. Keep R2 attachments and private homes buckets; bucket names/access were not inventoried here.

## One-time confirmation scope

Confirm the following concrete authority as one group before creating persistent access or changing host networking. Reuse existing valid credentials where sufficient; no broad replacement token is needed merely because its name differs. Store secret values only in Sigillo's dynamically resolved `LingxiLoop Control Plane` / `prod` environment or the approved provider/host credential store, never repository files or command arguments.

| Proposed secret name | Service and minimal scope | Use and storage |
| --- | --- | --- |
| `LINGXI_RELEASE_SSH_PRIVATE_KEY` | Dedicated non-root `lingxi-release` user on txy2 `182.254.156.84` and txy `111.229.65.23`; pinned host keys; forced reviewed release command, no arbitrary shell/Docker socket/global sudo | Reviewed host controller transport; private key in Sigillo, public authorized key plus forced-command policy on exact hosts. Docker permission must be mediated by the narrow host helper. Revoke key to roll back access. |
| `LINGXI_RELEASE_CF_ACCESS_CLIENT_ID`, `LINGXI_RELEASE_CF_ACCESS_CLIENT_SECRET` | One Cloudflare Access service token, policy allow only the chosen release transport application | Only if Tunnel/Access option selected; Sigillo secrets, expiration/rotation recorded. Not a replacement for host command authorization. |
| `LINGXI_RELEASE_TUNNEL_TOKEN` | One named Tunnel with connector credentials for the exact two target hosts only | Only if Tunnel option selected; connector credential on approved host secret store, 0600, no broad Cloudflare management token on hosts. Exact token/connector split depends on selected tunnel topology. |
| `MIHOMO_SUBSCRIPTION_URL` | User-supplied Clash/Mihomo-compatible HTTPS subscription, exact origin approved in `MIHOMO_SUBSCRIPTION_ORIGIN` | Sigillo secret injected into refresh process; provider payload remains a credential-bearing 0600 file in a 0700 directory. No full subscription configuration is activated. |
| Existing GitHub/registry credential | Exact repository Actions/environment permissions and packages read/write as needed by the final controller | Reuse provider-backed credential; never grant org-wide admin or persist credential in a Docker config for read-only verification. New credential only if existing one is insufficient. |

Current injected presence checks: Komodo key/secret, Cloudflare token/account ID, MCP service token, Komodo webhook secret present. `MCP_AUTH_USER_ID`, `KOMODO_WEBHOOK_URL`, `SSH_PRIVATE_KEY`, `LINGXI_HOST_SSH_KEY`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `MIHOMO_SUBSCRIPTION_URL` absent. Presence does not establish permission; no attempted secret export. Existing Komodo administrator capability is verified. Cloudflare `whoami` succeeded; token verify returned HTTP 200/active; account Tunnel and Access-app list reads returned HTTP 200/success with zero resources each. These prove read access only; Tunnel/Access/DNS write permissions and host SSH are not verified. MCP provisioning and webhook repair are outside this preparation.

Network choice to confirm: (A) dedicated SSH from the approved runner address to the two exact hosts, restricted source IP/security-group rules and pinned host keys, or (B) Cloudflare Tunnel plus Access on dedicated proposed names `release-a.lingxilearn.cn` / `release-b.lingxilearn.cn`, forwarding only the restricted SSH listener, with default-deny Access policy and one service token. Names are proposals, not allocated resources. Keep `ops.christmas1314.xyz` and its Alibaba DNS unchanged. Option B needs account Tunnel/Access write and exact Cloudflare zone DNS write; existing Worker/D1/R2 access must not be mistaken for those capabilities. Outbound Tunnel connectivity, DNS, connector installation, ingress mapping and Access policy are new network changes; none were executed. Roll back by disabling the exact connector/policy, removing only newly created release DNS records and revoking only newly created tokens/keys. Never change shared ingress or remove product routes. Host transport is feasible in design but cannot be claimed operational before identity, network and forced-command tests pass.

For optional Mihomo host activation, confirm exact target hosts and a pinned, verified Mihomo binary version/digest, the loopback `127.0.0.1:17890` listener, registry-only routing, secret provider access and refresh/reload policy. This preparation performs none of the installation, service enablement, Docker daemon proxy changes/restarts, DNS/TUN or firewall changes. A Docker daemon proxy is host-wide and needs its own impact review because other projects share these hosts. Prefer invoking only the release client's approved explicit proxy path. Roll back explicit client proxy use and stop only the newly approved Mihomo service; retain previous provider until proven recovery.

## Prepared Mihomo workflow

`deploy/mihomo/config.json` fixes local policy: loopback mixed listener, no LAN, no external controller, no TUN/DNS interception, fixed registry rules, file provider. Subscription input cannot override listeners, rules, providers, DNS or control API. The importer accepts a conservative subset of proxy node properties; unsupported types/properties fail closed instead of silently weakening validation. It rejects YAML aliases, duplicate keys/names, invalid endpoints and payloads over 2 MiB. TLS certificate verification stays enabled; redirects and off-origin subscription downloads are rejected. `yaml` is available through the existing locked dependency tree; no dependencies were installed.

`deploy/mihomo/provider.env.example` contains only non-secret settings and a symbolic provider reference. The URL must be supplied by Sigillo into `MIHOMO_SUBSCRIPTION_URL`, not pasted into this file. Once the binary and private state directory are separately approved/provisioned, execute `node scripts/mihomo/refresh.mjs` inside the provider-injected process with non-secret settings loaded. It validates in a private candidate directory using the exact approved binary's `-t`, suppresses raw validator output, then atomically replaces the provider. Failed download/parse/validation leaves the last validated provider intact. It does not reload a running daemon. First refresh failure leaves no usable provider and must fail the release preflight.

Last validated is a syntax/configuration guarantee, not an assertion of working proxy nodes. Preserve the running last-known-good service until a separately supervised candidate passes registry probes; activate/reload only under the approved host procedure and restore the prior provider/service if those probes fail. No automated health promotion or service restart is claimed here.

`node scripts/mihomo/registry-check.mjs` probes canonical HTTPS origins through an already running loopback proxy, retaining TLS verification and printing only origin/status. A 401/404 proves only HTTP reachability; authenticated manifest/blob/package access must still be verified by the final release preflight with provider-injected read credentials and exact immutable references. This script neither logs in nor pulls images and never substitutes accelerator URLs. Existing production accelerator configuration remains unchanged.

Verified locally: `node --test scripts/mihomo/refresh.test.mjs` (3 tests: unsafe input rejection, approved HTTPS origin, failed refresh preserves last validated bytes). No real subscription, approved Mihomo binary, running proxy, host SSH, authenticated canonical registry pull or candidate activation was available/tested. Independent release qualification remains with the integrator.

Authoritative configuration references: [Mihomo proxy providers](https://wiki.metacubex.one/en/config/proxy-providers/) and [general configuration](https://wiki.metacubex.one/en/config/general/).
