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

After concrete native-proxy approval, the same entry performs finite maintenance:
`scripts/release/run.sh route-native a|b query|install|validate|start|probe`.
Execute A/B serially, query uncertain results before retry, and never infer
authorization from the command's existence. This reuses the pinned inactive
installer, validates the existing private provider and fixed policy, verifies
systemd actually loaded the provider and a loopback-only listener, and performs
bounded TLS/HTTP probes. It neither configures nor restarts Docker, does not
enable boot-time service startup, and reachability is not authenticated image
pull qualification. An uploaded TLS-bypass option is rejected, not activated.
After separate approval to exclude such nodes, use
`scripts/release/run.sh route-native a|b filter-provider <verified-upload-sha256>`.
The fixed action preserves a private hash-named original, atomically writes only
the safe nodes, records a resumable receipt, and refuses file drift or a running
proxy. It never silently enables certificate bypass. Native validation grants
Mihomo only the exact already-approved provider path through `SAFE_PATHS`; the
service drop-in grants only its corresponding systemd credential file.
For an explicitly authorized same-image download measurement, run
`scripts/release/run.sh route-benchmark a|b registry|r2 <qualified-manifest.json> [1|3]`.
Use the same concurrency for compared routes. Each sample has a 180-second work
budget plus at most 25 seconds for outstanding socket cleanup, zero implicit retries, complete object
size/hash checks, no local download-cache reuse, and separate failure receipts.
It reads existing registry/executor credentials only in host memory. Registry
requests use the approved loopback proxy with normal TLS; R2 uses the existing
direct route. It does not load images or switch applications, so report this as
download evidence, never as an end-to-end publication speedup.

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

Immutable manifest registration has a fixed 60-second transfer allowance:
the measured 569,325-byte B request took 28.489 seconds and exceeded the former
20-second query timeout. Ordinary JSON queries retain 20 seconds. This does not
increase Workflow step/request limits, retries or the persisted operator deadline.
After an unknown registration result, inspect the same release/hash in the host
journal before an operator continuation; a registered manifest alone proves no
business operation or acceptance. Keep the first failure and manual actions.

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

## Explicit Docker proxy maintenance

After separate concrete daemon/restart approval, use the same entry:
`route-native a|b docker-plan` reads the actual daemon command line and validates
the candidate with those same flags. A CLI-provided live-restore value must not
be duplicated in JSON. `route-docker a|b query|apply|restore <original-config-sha256>`
performs a fixed bounded operation (omit the hash for query). It preserves the
original private configuration, checks zero host inflight, verifies complete
container/image/start-time/mount identity, and enables B live-restore via reload
before the approved single restart. It never starts an ordinary product release.
Unknown restart outcomes require query and effective proxy observation, never
blind repetition. Readiness has a finite20-second grace inside the existing
operation deadline. A prepared intent with unchanged configuration can be closed
without restarting Docker. Corrected maintenance uses explicit
`query-corrected|apply-corrected|restore-corrected` actions only after the original
receipt proves restoration; it preserves the original record. A failed attempt
that consumed an approved restart requires concrete additional restart authority.
The proxy service remains disabled at boot; boot enablement was not approved.

After the separately approved daemon proxy is active, `route-pull a|b
<qualified-manifest.json>` performs one bounded immutable Docker pull and verifies
actual config/rootfs/platform/repository identity. Append `query` to inspect an
uncertain outcome without another pull. A missing local image does not prove
absence of cached layers: report cache state and do not claim a cold speedup.
The command never switches an application or changes a container.

## Bounded preparation and source restoration

The same entry waits up to 30 seconds for an acknowledged resume Workflow to initialize, within its persisted operator deadline. Registry cache preparation uses quiet output, reads immutable image identity after an uncertain response, and permits only one transient retry (at most 300 seconds per attempt within the original 900-second prepare window). Authentication, TLS and identity failures never retry. Failed pull evidence remains in the host steps.

An exited backup uploader with `ARCHIVE_UPLOAD_UNCONFIRMED` may settle as a failed backup only after exact original schema/runtime/migration identity and absence of all migration/application/recovery intents prove source restoration safe. This never qualifies a backup or permits migration. The existing controller recovery restores the exact source and preserves the original failure and local backup.

Database phases receive a persisted minimum 600-second stage budget (service-drain budgets stay unchanged). Archive metadata retains its existing 60-second default; a dump upload has a separate bounded 300-second default. This covers the measured 72 MB final snapshot without extending a completed or expired stage on resume, raising Cloudflare limits, or omitting remote-backup verification.

Archive helpers release unused metadata/error response bodies. A transport timeout,
reset/closed connection or temporary DNS error permits at most one additional POST,
only after fresh metadata confirms absence, a 500 ms backoff, and remaining time
in the original upload deadline. Both POSTs use the same generation, manifest,
content hash and immutable conditional object key. A verified readback succeeds
without replay. HTTP denials/quotas, TLS, permanent DNS, identity errors and an
expired upload budget never retry; no timeout or stage budget is increased.

Archive helper failures retain `archiveDiagnostics` in the host operation's error
receipt: at most five fixed-phase events, allowlisted transport code/outcome,
observed HTTP status, elapsed milliseconds and whether the upload budget expired.
The read-after summary reflects the last observation; successful receipts include
`uploadAttempts` and retain the first failed response. A missing HTTP status means
none was observed. Tokens, URLs, headers, bodies and raw exception text are excluded.
