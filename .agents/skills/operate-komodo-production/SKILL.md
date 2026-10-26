---
name: operate-komodo-production
description: Operate retained shared Komodo stacks and Core through Sigillo. LingxiLoop product releases use the release controller skill; this skill covers shared control-plane maintenance, migration, ingress and DNS.
---

# Operate Komodo Production

Work from the LingxiLoop repository root. For LingxiLoop product releases and recovery, use [Operate Release Controller](../operate-release-controller/SKILL.md). This skill owns retained shared infrastructure: `server-b-ingress`, `landing`, `lingxilit`, `uptime`, Komodo Core/agents and their explicitly authorized maintenance. Product stack records remain available for read-only inventory and authorized one-time bootstrap transport; they do not authorize a product rollout or reactivation of the old publisher.

For an authorized control-plane bootstrap, recovery, or host migration, read [control-plane maintenance](references/control-plane.md); those operations need their existing SSH access because Core cannot orchestrate its own outage. This does not create a new SSH or production authorization requirement for the release controller.

## Ownership and topology

**Migration accepted (2026-10-17):** Core, MongoDB, keys and backups run on txy3. Public HTTPS and authenticated API access are verified, `manager`/`shanghai-a`/`shanghai-b` are connected, all eight stacks are running, and the public API's `Backup Core Database` procedure completed successfully. DNS points to `49.232.41.248`. See `artifacts/control-plane-migration-20261016/after.json` and `migration-status.json` for evidence. This completed scope is the deployment control plane; the independent wegolibrary application remains on aly.

| SSH host | Komodo Server | Responsibility |
| --- | --- | --- |
| `txy3` (`49.232.41.248`) | `manager` | Komodo Core 2.3.3, MongoDB 8.0.32, control ingress, Core keys and backups |
| `txy2` (`182.254.156.84`) | `shanghai-a` | Product state and application A |
| `txy` (`111.229.65.23`) | `shanghai-b` | Public product ingress, knowledge, application B, landing, LingxiLit, uptime |
| `aly` (`47.93.133.55`) | `aly` (disabled) | Existing wegolibrary and its separate ingress; retired Core data retained for rollback; not a release dependency |

- The stable API/UI origin is `https://ops.christmas1314.xyz`. Its DNS is in **Alibaba Cloud DNS**, not the Cloudflare account used for LingxiLoop Workers. Keep this origin, signing secrets and resource IDs stable during host moves unless the user requests a domain change.
- Periphery 2.3.3 runs through systemd on the three active hosts, connecting outbound to Core. The aly service and legacy Server are disabled. Each host owns its own Periphery private key; do not clone agent identities. Preserve Core's `komodo_keys` volume when relocating Core.
- `deploy/komodo/shared-resources.toml` is the reviewed retained ResourceSync scope. The original `resources.toml` and `lingxiloop-production-rollout` stages are historical rollback evidence. Do not upload that old full source, execute the retired trigger, or let a sync adopt the four controller-owned stacks/Procedure again. Core and control ingress remain separate bootstrap infrastructure.
- `deploy/komodo/core/` and `control-ingress/` belong on **txy3**. `deploy/komodo/aly-ingress/` belongs on **aly** and preserves its historical Compose project name `control-ingress`, container `aly-traefik`, certificate volume and wegolibrary network. Do not install the txy3 ingress manifest on aly.
- Preserve `/opt/apps/wegolibrary` and its Compose resources. Memos, Arcane and the old Agent OS/harness are retired; do not recreate them.
- Preserve PostgreSQL product state, WuKongIM durable IM, Redis coordination, Open Notebook/SurrealDB ownership, authorization, signed callbacks and the shared LLM ledger.
- Keep the registered `accel.way2api.fun` GitHub/GHCR/image accelerator. Do not introduce another proxy or upgrade infrastructure versions as part of a migration.

## Credentials and Windows CLI

Sigillo is the persistent operator credential source. On this Windows host use the official CLI from `npm exec --yes --package=sigillo@0.14.2 -- sigillo ...`, without changing global PATH. Resolve `LingxiLoop Control Plane` using `projects`, then confirm its `prod` environment with `environments -p <project-id>`. Never hardcode the project ID.

Use the official Komodo CLI 2.3.3 through [scripts/km.cjs](scripts/km.cjs). It maps injected API credentials into the WSL child and fixes the stable HTTPS origin:

```powershell
npm exec --yes --package=sigillo@0.14.2 -- sigillo run -p <project-id> -c prod -- C:\nvm4w\nodejs\node.exe .agents\skills\operate-komodo-production\scripts\km.cjs list servers --format json
```

Replace only the final CLI arguments. Resolve executable paths first, preserve Windows backslashes, and use argument arrays. Do not use `--command`, nested shell assignments, cached CLI logins or local credential profiles. Keep Sigillo redaction enabled. Never print secret values, copy them into arguments or local files, or emit full resource configurations containing environments. A zero exit code with empty output is not success: this Sigillo build can lose output when paths use forward slashes or its output is piped through PowerShell.

The wrapper replaces existing Komodo names in `WSLENV` with unflagged entries; `/w` entries do not reach Linux. Do not patch global PATH to repair a command.

Use a PTY for authenticated commands on this Windows host. If Sigillo stalls before spawning its child or reports `TlsInitializationFailed`, confirm the child did not start before ending/retrying that attempt. Do not leave duplicate migration jobs pending or disable redaction to diagnose transport errors. A CLI version response alone does not verify credential injection; require actual authenticated resource output.

## Preflight for the operation

1. Inspect the working tree, affected manifests and live Komodo resources. Preserve unrelated local changes.
2. Confirm the Sigillo version, `me --json`, project/environment identity, and the wrapper's `--version` through Sigillo. List servers, stacks and procedures; require the expected names, addresses and versions. Releases require healthy `manager`, `shanghai-a` and `shanghai-b` connections. The retired aly record is intentionally disabled and must not block releases; require it online only for an operation that actually targets aly.
3. Check only tools used by this operation: `git`/`gh` for source and workflows, Docker for Compose validation, and Wrangler for Cloudflare. If Cloudflare is affected, run `wrangler whoami --json` through Sigillo, not a cached login. Resolve the authoritative DNS provider before changing any record.
4. If credentials or expected resources are missing, stop the dependent mutation and finish independent preparation. Ask only for the missing access or information; an already authorized migration/release does not need another approval.

## Shared-resource operations and verification

1. Identify the exact retained target and current source/configuration hash. Keep
   the accepted backend router and ingress source pin; do not float it to an
   older `main` checkout or overwrite the current single-file bind blindly.
2. Use the existing Sigillo-backed CLI/API only for the specifically authorized
   shared action. Do not call `scripts/trigger-komodo-rollout.mjs`, the old
   production Procedure, or the historical full ResourceSync source. Product
   deploy/start/stop/restart goes through the release controller.
3. Read every accepted update to terminal `Complete` with `success:true`, then
   verify that shared target's actual health/HTTPS and preserved configuration.
   A successful Core action is not proof of product acceptance.
4. A shared ResourceSync update must have `managed=false` and `delete=false`.
   Inspect a refreshed pending preview for only retained Stack IDs and no
   Create/Delete. Refreshing a preview does not authorize RunSync or deployment.

The post-acceptance publisher metadata retirement is separate from service
operations. Its exact IDs, field diffs and reversible source are documented in
[legacy retirement](../../../docs/release-legacy-retirement.md); the fixed
[root-only operator](../../../scripts/release/LEGACY-RETIREMENT-OPERATOR.md)
refuses incomplete runtime/recovery, trusted controller enablement, safe CI
staging or zero-inflight evidence. Preserve every product container, volume,
private permission, backup and original Procedure stage.

## Recovery and cleanup

Diagnose a failed shared-resource Komodo update and fix forward within the exact authorized target. Query unknown results before another mutation. Product recovery uses its existing controller release ID and host operation keys, not an old Komodo Procedure. Core outage recovery follows the linked maintenance reference.

For durable IM/WAL recovery, stop the affected writer and retain a complete cold backup before changing its reader. Do not truncate committed data, rewrite checksums or replace the volume to make startup pass. Prefer a narrowly pinned, tested upstream repair and compare original WAL prefixes, immutable data files, node identity and committed/applied positions before and after recovery.

Identify exact cleanup targets first. Stopping a superseded Core after a verified migration is part of cutover; deleting retained databases, backups, keys or unrelated resources needs explicit scope. Never run global prune or `compose down -v`. Do not start both old and new Core against independently writable databases.

## Maintain this skill

`.agents/skills/operate-komodo-production` is the source. Synchronize `SKILL.md`, `references/`, `scripts/` and `agents/openai.yaml` to the discovered local copy at `C:\Users\34395\.codex\skills\operate-komodo-production`; there is no automatic sync. An installed copy must match the reviewed repository revision before use; it must not override the repository release-controller boundary.

Run `node .agents\skills\operate-komodo-production\scripts\km.test.cjs` and `bootstrap.test.cjs` after changing their wrappers, then a real Sigillo read-only command or bootstrap `validate`. Validate the skill with skill-creator's `quick_validate.py`. Record non-secret verification artifacts including update IDs, server identities, service/image inventories and HTTP results.
