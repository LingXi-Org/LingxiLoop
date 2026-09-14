---
name: operate-arcane-production
description: Operate LingxiLoop production exclusively through Arcane, Sigillo, Wrangler, GitHub, Docker, and HTTP CLIs for GitOps releases, verification, recovery, and legacy cleanup.
---

# Operate Arcane Production

Operate from the LingxiLoop repository root. Use CLI commands for every action and check. Do not use the Arcane UI, browser automation, raw Arcane API calls, or direct Docker commands to deploy product Compose files.

## CLI and credential contract

- Use the official `arcane-cli` for Arcane environments, projects, variables, GitOps syncs, activities, and webhooks. On this Windows host, fall back to `$CODEX_HOME/bin/arcane.exe` when `arcane-cli` is not on `PATH`.
- Use `wrangler` for Cloudflare, `gh` for GitHub, `git` for source control, `docker compose ... config` for Compose validation, and `curl` for HTTP checks.
- Sigillo is the sole persistent source for operator authentication material. Use the Sigillo project named `LingxiLoop Control Plane` and its `prod` environment. Resolve its current project ID with `sigillo projects`; do not hardcode an ID or trust stale directory setup.
- Run authenticated CLIs through `sigillo run -p <project-id> -c prod -- <command>`. Resolve absolute executable paths before entering `sigillo run`; on Windows, also resolve script interpreters such as Node because the child process may not resolve wrapper dependencies.
- Secret names must map to the environment variables expected by the target CLI. Translate names only inside the ephemeral child process; never serialize values to arguments, files, logs, or chat. Keep redaction enabled and never use `sigillo secrets get --force`, `--raw`, or `sigillo run --disable-redaction` during operations.
- Local CLI configuration may retain non-secret endpoints and default environment IDs. Do not use a pre-existing local login for production mutations, and do not remove or alter it unless the user explicitly requests that cleanup.
- GitHub or Cloudflare runtime secrets are deployment destinations, not credential sources. Populate them from Sigillo through CLI stdin and never print their values.

## Mandatory preflight

Complete these read-only checks before any production mutation. Stop if any command fails or identifies the wrong account, Manager, or environment.

1. Confirm CLI versions with `sigillo --version`, `arcane-cli --version`, and `wrangler --version`.
2. Confirm Sigillo identity with `sigillo me --json`, resolve `LingxiLoop Control Plane` with `sigillo projects`, then confirm its `prod` environment with `sigillo environments -p <project-id>`.
3. Through `sigillo run`, confirm Cloudflare with `wrangler whoami --json` and Arcane with `arcane-cli auth me --json`, `arcane-cli config test`, and `arcane-cli version --json`. If Sigillo lacks a secret or ephemeral name mapping required by either CLI, stop before mutation; a working local login does not satisfy this gate.
4. Confirm both Arcane agents with `arcane-cli environments list --output json` and `arcane-cli environments test <id> --output json`.

## Production topology

- Arcane Manager v2.10.2 is the control plane. Shanghai A owns `lingxiloop-core-state` and `lingxiloop-app-a`.
- Shanghai B owns `server-b-ingress`, `landing`, `lingxiloop-knowledge-agent`, `lingxilit`, `lingxiloop-app-b`, and `uptime`.
- LingxiLoop GitOps Compose files are below `deploy/arcane/`; LingxiLit uses `deploy/arcane/compose.yml` so its large documentation tree is not synced.
- Application releases use four GitOps syncs: `lingxiloop-core-state`, `lingxiloop-app-a`, `lingxiloop-app-b`, and `lingxiloop-knowledge-agent`.
- Public routes are `lingxilearn.cn`, `loop.lingxilearn.cn`, `openlit.lingxilearn.cn`, `uptime.lingxilearn.cn`, and `admin.lingxilearn.cn`.

## Invariants

- Preserve `/opt/apps/wegolibrary` and `/opt/apps/memos_jPcn` on the Manager host.
- OpenShip and Mihomo are retired. Do not recreate their containers, directories, networks, releases, webhooks, service units, secrets, proxies, or compatibility adapters.
- PostgreSQL owns product state, WuKongIM durable IM, Redis ephemeral coordination, and vendored Open Notebook/SurrealDB its own schema.
- Preserve product authorization, signed callbacks/webhooks, and the shared LLM ledger. Never print credentials, tokens, prompts, decrypted values, or webhook URLs.
- Production LingxiOS requires non-zero model input and output prices. For `deepseek-ai/DeepSeek-V4-Flash`, use the approved Sigillo values instead of guessing.
- Use the GitHub/GHCR acceleration already registered in Arcane; do not add proxy or Mihomo configuration.

## Release flow

1. Run the mandatory preflight and inspect the affected environment, project, and dependencies with `arcane-cli ... --output json`.
2. Validate each changed Compose file with `docker compose -f <file> config --quiet`.
3. Update source manifests and use `git`/`gh` for the authorized source and workflow operations. GitHub Actions publishes immutable commit-tagged images and pins the application manifests.
4. Run only the owning syncs with `arcane-cli gitops status <name> --output json` followed by `arcane-cli gitops sync <name> --output json`. Follow the returned work with `arcane-cli activities get <id> --output json` until terminal success or failure.
5. Verify the owned project with `arcane-cli projects get <name> --output json`, inspect its containers through `arcane-cli containers ... --output json`, then check the public route with `curl --fail-with-body --silent --show-error`.

GitHub releases rely on the four Arcane GitOps webhooks stored as `ARCANE_GIT_SYNC_WEBHOOK_URLS`. Create, rotate, list, or trigger them only with `arcane-cli webhooks ...`. Store one-time webhook output immediately in Sigillo, then pipe the required value to `gh secret set ARCANE_GIT_SYNC_WEBHOOK_URLS --env production`; remove obsolete `RELEASE_HMAC_SECRET` with `gh secret delete ...` instead of restoring OpenShip.

## Recovery and cleanup

- Inspect failures with `arcane-cli gitops status`, `arcane-cli activities get`, `arcane-cli projects get`, and the narrow relevant container logs. Fix forward and rerun only the failed owning sync.
- Reconcile Manager variables with `arcane-cli variables list` and `arcane-cli variables sync --status`. If the Manager variable command is temporarily unavailable, restore only the affected agent through Arcane CLI, then reconcile the Manager source before the next sync.
- Before deleting retired resources, list the exact containers, volumes, networks, images, webhooks, and directories with the owning CLIs. Delete only confirmed legacy targets. Never run a global prune.

## Success criteria

Require Compose validation, successful Arcane activity and GitOps status, healthy owned project/container state, and the corresponding HTTPS result. Treat `307` from OpenLIT and `302` from Uptime Kuma as normal login redirects. A webhook `202` proves acceptance only; the Arcane activity must still finish successfully.
