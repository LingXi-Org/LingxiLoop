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

The single cloud operator is `scripts/release/run.sh`; do not assemble a second
manual publication loop. Run from the repository root:

```sh
scripts/release/run.sh doctor
scripts/release/run.sh route-check
scripts/release/run.sh preflight /absolute/qualified-manifest.json
scripts/release/run.sh publish /absolute/qualified-manifest.json
```

The immutable manifest is the selected release input, not a credential/config
template. Use the existing exact successful CI candidate artifacts and approved
configuration/contract proof; never synthesize a manifest to avoid a blocked
source or runtime schema check. `doctor` reuses the existing cloud provider and
the reviewed custom domain from `workers/release/wrangler.jsonc`, then reads the
accepted ledger. It does not probe or mutate GitHub Variables/Secrets. Missing
provider configuration or denied authorization stops before business writes.
`route-check` reads A/B metadata for the approved provider path, fixed config,
binary and service, without reading provider contents or changing a service.
The user will upload YAML manually to both hosts at
`/etc/lingxi-release/secrets/mihomo-provider.yaml`, root:root0600; the actual
parent directories were confirmed root:root0700. Wait for upload-complete notice
before validating content. Do not treat upload as network/Docker-change approval.
Online subscription fetch is not a release prerequisite; `subscription-check`
is an optional explicitly requested bounded read. The user now requires choosing
the fastest reliable distribution from measured evidence; R2 is not mandatory.
Do not switch to Clash until subscription plus authenticated registry/blob
measurements qualify it. Follow the exact approved A/B loopback design; any new
credential/security/daemon-proxy change needs its concrete authority. If replacing
R2 distribution, remove its old publishing path while preserving business assets,
bucket data and recovery receipts. Do not maintain automatic parallel fallback
publishers or infer a speed win from subscription reachability.

`preflight` checks the existing environment, exact app CI, exact operations CI,
existing release identity and controller plan. `publish` performs those same
checks, looks up the immutable ID before submission, and observes the controller
through automatic recovery to accepted/recovered/failed/blocked/superseded.
Recovered is compatible-service restoration, never candidate acceptance.
Each run persists a private atomic JSON receipt under `.release-runs/`, prints
a JSON result and human summary, and has a 40-minute observation deadline that
survives process restart. Reinvoke the identical command to resume that receipt;
never delete it to reset a budget. Observation expiry does not cancel a remote
Workflow or release its locks. Read the actual state before any next mutation.

Explicit administrator actions use the same entry:
`scripts/release/run.sh resume|recover /absolute/original-manifest.json`.
They require existing admin authority and a terminal predecessor enforced by
the controller. An uncertain admin response is reconciled by its changed
Workflow identity, never blindly repeated. A different new command requires
the designated operator's evidence and authority, not automatic quota reset.

Use `node scripts/release/timing-report.mjs release receipt.json` for retained
controller records and `... ci run.json attempt-jobs.json` for GitHub metadata.
Keep execution, queue, unknown approval time and recovered/incomplete outcomes
separate. See [issue #514 evidence](../../../docs/evidence/issue-514/README.md).

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
