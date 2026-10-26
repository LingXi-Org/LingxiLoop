---
name: operate-release-controller
description: Plan, observe and recover LingxiLoop product releases through immutable manifests, the administrator MCP/CLI, durable controller records and fixed host executors. Keep shared Komodo maintenance separate.
---

# Operate Release Controller

Work from the repository root and follow [the release protocol](../../../docs/release-controller.md)
and [MCP boundary](../../../docs/release-mcp-cutover.md). The designated sole
integrator serializes production writes. Repository edits, a merge, an old
green run or a queued request are not deployment authority or acceptance.

## Product entry and immutable evidence

Use the existing administrator `lingxiloop_release_plan/submit/get/watch/resume/recover`
tools, or `scripts/release/cli.mjs` / `scripts/release/mcp.mjs` with credentials
injected through the existing provider. Keep submit/read and admin credentials
separate. Do not print secrets or pass them in manifests or command arguments.
The cloud operator can use `source /workspace/.lingxi-production/env.sh` followed
by `lingxi-prod run node --use-env-proxy <fixed-script>`; use only tools needed
for the current authorized action.

Bind exact app and operations SHAs, formal package provenance, successful
matching CI, full OCI/archive identities, the component's accepted source,
explicit contract/capabilities, original durable mounts and installed named
probes. Prepare both runtime hosts before any drain. Same-schema qualification
does not authorize a schema change. A schema-changing plan requires the fixed
maintenance barrier, final zero-write-loss backup, isolated restore verification
and exact checksum ledger before migration; it cannot automatically undo DB
commits or run an incompatible old image.

The DO/Workflow owns generations and resource locks; the host journal records
intent before acceptance and side effects. Wait for actual host phase completion,
both Web/Worker healthchecks, actual artifact identities, runtime/schema
provenance and HTTPS/business probes. Require the real accepted controller record
and retained R2 receipt. Forward/recovery/cleanup failures stay distinct.

## Unknown results and recovery

Query the same release/operation key before any further mutation. Unknown
effects retain ownership; do not clear locks, invent a new release ID, expire a
lease, or replay a successful host action. Administrator resume/recover requires
the existing Workflow to be terminal and preserves operation keys/generation.
An accepted terminal release cannot be recovered through that API; a deliberately
controlled separate qualification release is used to verify recovery behavior.
Recovery must use prepared compatible artifacts and retain original volumes.

## CI and old-publisher boundary

Actual user readback controls `RELEASE_OPS_SHA` and `RELEASE_CONTROLLER_ENABLED`;
do not infer their values or retry denied Variables/Secrets permissions. When
business batches are paused, use only authorized `publish_only=true` CI staging
and verify its deploy/register/report jobs were skipped; do not deploy current
main merely to exercise CI. Restore normal business CI only when its batch owner
resumes that scope. A maintenance-only merge during this pause must retain the
existing `[skip deploy]` commit-message guard so it cannot publish paused changes.

After complete acceptance/recovery and zero-inflight evidence, the approved
[fixed retirement operator](../../../scripts/release/LEGACY-RETIREMENT-OPERATOR.md)
may disable only the old publisher metadata. Do not use the old
`trigger-komodo-rollout.mjs`, full `resources.toml`, or Komodo stack mutators to
publish LingxiLoop. Preserve old records/stages, private permissions, backups,
all containers and volumes. [Operate Komodo Production](../operate-komodo-production/SKILL.md)
covers only retained shared infrastructure/Core and explicitly authorized
bootstrap transport; its existence does not reopen product publication.
