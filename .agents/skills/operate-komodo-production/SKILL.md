---
name: operate-komodo-production
description: Operate LingxiLoop production through Komodo, Sigillo, Wrangler, GitHub, Docker validation, and HTTP checks for releases, verification, recovery, and targeted cleanup.
---

# Operate Komodo Production

Work from the LingxiLoop repository root. Use Komodo CLI/API state for every deployment and verification. Do not use the Komodo UI, browser automation, host SSH, or direct Docker commands to deploy product Compose files.

## CLI and credentials

- Use the official Komodo CLI v2.3.3. On this Windows host, use [scripts/km.cjs](scripts/km.cjs) through Sigillo; it runs the installed Linux binary through WSL without a container.
- Use `sigillo` for operator credentials, `wrangler` for Cloudflare, `gh` for GitHub, `git` for source control, `docker compose ... config` for local validation, and `curl` for public HTTP checks.
- Sigillo is the only persistent credential source. Resolve the current ID of its `LingxiLoop Control Plane` project with `sigillo projects`, and use its `prod` environment; never hardcode a project ID.
- Run authenticated commands through `sigillo run -p <project-id> -c prod -- <command>`. Resolve executable paths first. Map `KOMODO_API_KEY` and `KOMODO_API_SECRET` to `KOMODO_CLI_KEY` and `KOMODO_CLI_SECRET` only inside the ephemeral child process; set `KOMODO_CLI_HOST=https://ops.christmas1314.xyz` there.
- Never put secrets in arguments, files, local CLI profiles, logs, or chat. Keep Sigillo redaction enabled and never use raw secret output or disabled redaction.

### Windows command

After resolving the current project ID with `sigillo projects` and checking `sigillo environments -p <project-id>`, use this one command from the repository root (replace the project placeholder):

```powershell
sigillo run -p <project-id> -c prod -- C:\nvm4w\nodejs\node.exe .agents\skills\operate-komodo-production\scripts\km.cjs list servers --format json
```

Replace only the final CLI arguments for `--version`, `list stacks --format json`, `list procedures --format json`, or an authorized CLI operation. Preserve Windows backslashes in the executable and script paths. Use argument arrays rather than `--command`, inline shell assignments, or nested PowerShell quoting. Require the expected version/resource output as well as exit code zero; this Sigillo build can produce empty output when paths use forward slashes or its output is captured in a PowerShell pipeline.

The wrapper uses absolute WSL/binary paths so Sigillo's reduced PATH cannot hide `wsl.exe`; maps injected API credentials in the child environment; and replaces any existing CLI entries in `WSLENV` with unflagged names. `/w` entries do not reach Linux. Missing credentials/binaries and CLI failures exit nonzero. Do not patch global PATH or fall back to cached CLI credentials.

Maintain `.agents/skills/operate-komodo-production` as the repository source; synchronize its `SKILL.md` and `scripts/` to the discovered local copy at `C:\Users\34395\.codex\skills\operate-komodo-production` after changes. There is no automatic sync. Run `node .agents\skills\operate-komodo-production\scripts\km.test.cjs` and a Sigillo read-only CLI command after changing the wrapper.

## Mandatory preflight

Before a production mutation:

1. Confirm `sigillo --version`, the wrapper's `--version` through Sigillo, `wrangler --version`, `gh --version`, `git --version`, and `docker --version`.
2. Confirm `sigillo me --json`, resolve `LingxiLoop Control Plane`, and confirm its `prod` environment.
3. Through `sigillo run`, confirm the Komodo host and identity by listing the named servers, stacks, and procedures with `km`; confirm Cloudflare with `wrangler whoami --json` when Cloudflare is in scope.
4. Stop if credentials are missing, the host is not `https://ops.christmas1314.xyz`, or the expected resources are absent. A local cached login does not satisfy this gate.

## Production ownership

- Komodo v2.3.3 is the deployment control plane. `aly` hosts Core and MongoDB; `txy2` is `shanghai-a`; `txy` is `shanghai-b`.
- `deploy/komodo/resources.toml` owns production resources. The ordered procedure is `lingxiloop-production-rollout`.
- The main owned stacks are `server-b-ingress`, `lingxiloop-core-state`, `lingxiloop-knowledge-agent`, `lingxiloop-app-a`, `lingxiloop-app-b`, and `uptime`. The procedure also coordinates `landing` and `lingxilit`.
- Preserve `/opt/apps/wegolibrary` and all of its Compose resources. Memos and other retired resources must not be recreated.
- Preserve PostgreSQL product state, WuKongIM durable IM, Redis ephemeral coordination, the Open Notebook/SurrealDB schema, product authorization, signed callbacks, and the shared LLM ledger.
- Keep the registered GitHub/GHCR accelerator. Do not add an alternate proxy.

## Release and verification

1. Inspect `git status`, the affected manifests, `deploy/komodo/resources.toml`, and the corresponding Komodo stack state.
2. Validate each changed Compose file with `docker compose -f <file> config --quiet`.
3. Use repository scripts and `git`/`gh` for the authorized source and workflow operations. GitHub Actions publishes immutable commit-tagged images, pins manifests, deploys the Worker when required, and triggers the signed rollout.
4. For the repository release path, run `scripts/trigger-komodo-rollout.mjs` only through Sigillo. It triggers the signed procedure, obtains the Komodo update ID, and polls `/read/GetUpdate` until `status` is `Complete` and `success` is true.
5. For an explicitly authorized manual rollout, use `km run procedure lingxiloop-production-rollout -y` when supported by the installed v2 CLI. Capture the returned update and verify its terminal state through the Komodo API; webhook acceptance alone is not success.
6. Inspect only affected stacks, services, update history, and narrow logs. Then check the corresponding HTTPS route with `curl --fail-with-body --silent --show-error`.

Use the repository's existing Komodo API shapes rather than inventing requests: `scripts/trigger-komodo-rollout.mjs` owns procedure update polling, and `workers/control-plane/src/komodo.ts` owns stack inspection, updates, logs, and actions.

## Recovery and cleanup

- Diagnose failures from the Komodo update, affected stack action state, service state, and narrow logs. Fix forward and rerun only the failed owning operation or the ordered procedure when its dependency chain requires it.
- Before cleanup, list and identify every exact target in Komodo. Delete only explicitly authorized legacy targets and never run a global prune.
- Do not bypass Komodo by deploying Compose directly on a host.

## Success criteria

Require Compose validation, a terminal successful Komodo update, healthy affected stack/services, and the corresponding HTTPS result. Treat expected authentication redirects as healthy only for routes documented that way in the repository.
