---
name: operate-komodo-production
description: Release, inspect, and recover LingxiLoop production through Komodo on txy3 and Sigillo. Includes control-plane host maintenance, migration, and the associated ingress and DNS.
---

# Operate Komodo Production

Work from the LingxiLoop repository root. Product releases use Komodo CLI/API state, not the Komodo UI or direct host Compose deployments. For an authorized control-plane bootstrap, recovery, or host migration, read [control-plane maintenance](references/control-plane.md); those operations need SSH because Core cannot orchestrate its own outage.

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
- `deploy/komodo/resources.toml` owns the eight product stacks and the ordered `lingxiloop-production-rollout` procedure. Core and control ingress are bootstrap infrastructure outside that resource sync.
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

## Product release and verification

1. Validate each changed Compose file with `docker compose -f <file> config --quiet`, injecting credentials through Sigillo. Do not emit interpolated Compose output.
2. Use repository scripts and `git`/`gh` for authorized source/workflow operations. GitHub Actions publishes immutable images, pins manifests, deploys the Worker when required and triggers the signed rollout. A control-plane host move does not require an unrelated product release.
3. The repository trigger is `scripts/trigger-komodo-rollout.mjs`, run through Sigillo with its required webhook and API variables. It captures the Komodo update ID and polls `GetUpdate` for `status: Complete` and `success: true`. Do not assume the webhook URL exists in a particular credential store; verify variable presence without printing values.
4. For an authorized manual rollout, use `km run procedure lingxiloop-production-rollout -y` when supported by the installed CLI. Capture its update ID and verify completion through the API. HTTP acceptance alone is insufficient.
5. Inspect affected stack action states, individual service health, update history and narrow logs, then check the relevant HTTPS routes with `curl --fail-with-body --silent --show-error`. A successful update or running stack does not prove that its Workers are ready: require both Worker healthchecks, Web readiness, expected runtime/schema versions and actual image digests. Accept authentication redirects only where documented.

Before a runtime schema upgrade, verify a snapshot-consistent backup by restoring it into an isolated database, drain all old Workers and verify no live leases, then follow the ordered migration/deployment procedure. Compare installed schema provenance to the exact packaged schema. Never reset production state or restart an older Worker against an upgraded schema.

Use existing API shapes from `scripts/trigger-komodo-rollout.mjs` and `workers/control-plane/src/komodo.ts`; consult the matching Komodo version's API for other operations. Never print complete secret-bearing API responses.

## Recovery and cleanup

Diagnose the failed Komodo update and owning service, fix forward, and rerun only the failed operation or the ordered procedure when its dependencies require it. Product Compose deployments still go through Komodo even when using SSH to diagnose infrastructure. Core outage recovery follows the linked maintenance reference.

For durable IM/WAL recovery, stop the affected writer and retain a complete cold backup before changing its reader. Do not truncate committed data, rewrite checksums or replace the volume to make startup pass. Prefer a narrowly pinned, tested upstream repair and compare original WAL prefixes, immutable data files, node identity and committed/applied positions before and after recovery.

Identify exact cleanup targets first. Stopping a superseded Core after a verified migration is part of cutover; deleting retained databases, backups, keys or unrelated resources needs explicit scope. Never run global prune or `compose down -v`. Do not start both old and new Core against independently writable databases.

## Maintain this skill

`.agents/skills/operate-komodo-production` is the source. Synchronize `SKILL.md`, `references/`, `scripts/` and `agents/openai.yaml` to the discovered local copy at `C:\Users\34395\.codex\skills\operate-komodo-production`; there is no automatic sync.

Run `node .agents\skills\operate-komodo-production\scripts\km.test.cjs` and `bootstrap.test.cjs` after changing their wrappers, then a real Sigillo read-only command or bootstrap `validate`. Validate the skill with skill-creator's `quick_validate.py`. Record non-secret verification artifacts including update IDs, server identities, service/image inventories and HTTP results.
