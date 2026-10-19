# Issue 193 release qualification

Release owner: the root integration session. No other agent publishes or deploys.

The previous production product is `b76c4cc00f545ddbca27bced6628e1ed191e6777`, pinned by main `b2013edc7685d86e131c5c7f011078fdf2d3e008`. Its LingxiOS runtime remains 3.5.3/schema 12. This change adds only product migration 0046; migration 0033 and its historical tables/data remain intact. The independent 3.5.3 soak is outside this release and has not been altered.

## Source and checks

- Product PR: [195](https://github.com/LingXi-Org/LingxiLoop/pull/195), merged as `bc6dd87d203496580914069d4854f8958692a196` with `[skip deploy]`. The product tree matches qualified `3cc75c7b`; final commit `56f5f05b` only supplies an explicit type for the existing E2E security evidence array.
- Full CI passed at `8ea6b48f25ffabf0240a9fe2cdcd1e8b20feb771`: [39254963846](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39254963846), integration 291 passed / 0 failed / 11 explicitly skipped. Latest qualification commit `54075c1af031172f768a1894c8bd29a5ce74e98f` reduces verified source reads from 2000 to 4000 characters, retaining the fallback; its [CI 39257571867](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39257571867) also passed all owning checks.
- The initial CI failures (message-facade import cycle, obsolete registry/protocol expectations, truncated native skill output) are retained in run 39251835456. They were fixed in subsequent commits; that failed run is not a release gate pass.
- Local server suite: 101/101; Web suite: 65/65. Backend Visualize: 6/6; admin platform: 9/9; send reconciliation: 18/18. Native Visualize/teacher/protocol batch: 7/7. Final code CI and browser evidence remain separately tracked; provider acceptance has the explicit limitation recorded below.
- The original 24-file skill and the final 223 archived manifest files pass their pinned hash checks (the original 221 are unchanged; two fixed Web entry/theme sources were added for the independent baseline). The source-port matrix and actual interaction/pixel reports are separate evidence.

## Backup and migration rehearsal

[backup-rehearsal.json](backup-rehearsal.json) records Komodo update `6ad61077e06d5e1f798325bb`, `Complete`, `success: true`. The script took one read-only exported snapshot of production schema 45, restored it into a newly owned isolated database, and compared all 169 original table counts and exact runtime/migration provenance. It rehearsed the original 0046 bytes inside BEGIN/ROLLBACK with matching counts, provenance and catalog fingerprint, then committed once in the isolated database. The resulting 173 tables comprise the unchanged original tables plus four empty Visualize tables. The isolated database was removed successfully; the live database was not migrated by this operation.

- Dump SHA-256: `141f6d62b33e32b41df793a0acf9a0d88c89e449c237dc26747d26256a5c4a95`.
- 0046 SHA-256: `3d486aad6524a899544c953cb5989a8f8afcafe5cb555be9d36aed21520a879b`.
- Retained backup: `/var/lib/postgresql/data/visualize-upgrade-backups/5554c0f3c21ba3350e78ed6076e639ad0124645a/rehearsal-20261019-193-01`.
- Disk headroom was checked before dump and before restore. The exact counts, runtime schema hash, command hash and rollback fingerprint are in the JSON receipt. No row contents or credentials are included in repository evidence.

## Compatible fallback

The unmodified old Web and Worker binaries reject an unknown product migration 46 at startup. Merely pinning the previous image is therefore not an acceptable rollback.

Branch `codex/issue193-rollback-migration46`, commit `414a8719bdd808f04b9d520fee7fabe260b11e93`, starts from the exact previous manifest main and changes only the original-byte 0046 SQL plus the existing migration integration fixture. Active application behavior, dependencies, startup code and CI are otherwise identical to that base. The migration fixture checks acceptance of schema 46, rejection when its file is absent, two no-op passes, and retention of both old feature data and populated Visualize tables.

[CI 39256803677](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39256803677) passed with `scope=server`, `publish_only=true`, and published the immutable compatibility image. [fallback-image.json](fallback-image.json) records image digest `sha256:b89367493599bd7a4f53e2e02e82c7aae60bb475cc822356a34021122cc411d0`; deployment was skipped. The initial run 39254701857 failed only because the fixture compared the runtime installation timestamp that normal migration refreshes; the final fixture retains all other runtime and business fields. Local verification covered all 32 cases: 15 passed before a local PostgreSQL interruption, then the remaining 17 passed on an isolated instance; a separate filled-0046 run also passed. See [rollback-local.json](rollback-local.json), including preserved failed-run evidence. This validates schema/startup consistency gates and data retention; it does not claim an old UI renders Visualize or that old Web/Worker processes received an end-to-end smoke.

After schema 46 is committed, recovery must use a qualified compatible image or fix forward. Do not delete migration records, drop Visualize tables, or restore an old snapshot over live writes. No production fault injection is authorized or performed.

## Release sequence

Final implementation commit `3cc75c7b9c1ac22acb61c6e16226c9c220d93149` passed [CI 39260636211](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39260636211). The final official presentation run passed 4/4 scenarios and all six independent Web light/dark screenshot pairs had zero differing RGBA pixels. [browser-source-binding.json](browser-source-binding.json) binds every versioned consumed source to that commit; the subsequent type annotation does not affect those files. The focused stale-page/retry/replacement/scope-close scenario also passed. [COVERAGE.md](COVERAGE.md) records individual outcomes without treating fixed browser fixtures as real-provider acceptance.

The merged source must pass main CI and publish its immutable image before a separate manifest merge triggers the sole ordered Komodo rollout. The compatible fallback image is already published. This checkpoint does not yet claim a production release or close issue 193 or the separate historical acceptance issues.

The corrected full E2E TypeScript check passed. The two manifest changes only pin the shared Web/migration image and explicit Worker image from `b76c4cc0` to `bc6dd87d`; no environment or security settings change. Read-only pre-release observation at 13:56–13:57 UTC confirmed the old version on all four healthy containers and the public metadata/readiness endpoints, with idle stack action states. This is infrastructure readiness evidence, not a model request smoke.

Both changed Compose files passed `docker compose config --quiet --no-interpolate` through Sigillo. Full local interpolation could not run because the control-plane credential project does not supply product `R2_BUCKET`/`R2_ACCESS_KEY_ID`. No credentials were copied or configuration changed to bypass this. The existing production stack supplies its own environment; the manifests change only image hashes, deployment-contract CI passes, and actual interpolation/startup remains a requirement of the ordered Komodo operation. Structural validation is not reported as successful local secret interpolation.

## Explicit provider acceptance limitation

The complete real-model generation → browser adjustment → follow-up → standalone export sequence has not passed. The final bounded request terminated at 180 seconds after an earlier local heartbeat/connection interruption and native lease recovery. A tiny same-model diagnostic returned HTTP 200 quickly, so the evidence does not support a supplier-wide outage claim. The public worker configuration and successful initial tool calls reveal no located deterministic issue-193 request defect; full request wire-size/tool-count metadata was unavailable. The [attempt summary](../../../artifacts/visualize/runtime/live-attempt-summary.json) and [request review](../../../artifacts/visualize/runtime/request-shape-review.md) distinguish measured usage, estimates and an unknown interrupted request.

The release owner received explicit authorization to stop indefinite optional provider retries and release after the core implementation, safety, functional and visual checks, retaining this item as unaccepted in issue 193. The model, provider and 180-second limits remain unchanged. This is a disclosed release limitation, not a successful real-model test.

## Browser environment limitation

The default official browser denied `navigator.clipboard.read()`. A separate permission-scoped browser provider could not launch because the cloud host reports `No usable sandbox`; no sandbox setting was weakened. The final official-engine observer called the original native write and received its original rejected promise: `Write permission denied`. There is no successful PNG/write/readback evidence. The observer did not replace permission checks or fabricate a result.

The bounded browser capacity scenario failed while waiting for fixture page 41 to become ready. Pages 0–40 were ready and 42 creation requests returned HTTP 200; the last page subsequently entered an error state. The original trace and diagnostic are retained under `functional-final/`. No unique cause or deterministic product defect was established; the browser 64/65 boundary remains unaccepted. Passed backend limit regressions are separate evidence. The release coordinator explicitly authorized proceeding after this bounded attempt rather than retrying indefinitely.

## Pre-existing production model incident

Before this release, the parent coordinator's separate investigation of #197 identified actual 180-second production model timeouts without memory-tool invocation, three 30-second structured-helper timeouts, and a shared circuit breaker through which background failures affect foreground conversations. This is the coordinator's incident finding, not a new investigation by this release owner. Public infrastructure health does not establish model business availability. This release does not change the provider or timeout settings and does not claim to resolve #197. The separate #196/#197 fix must follow serially from the new main. A sanitized read-only production configuration snapshot is tracked separately.

[production-model-config-before.json](production-model-config-before.json) records eight successful Komodo read requests, zero execute/write/model calls, and selected `InspectContainer Config.Env` values from the four stable running containers. All four specify `zai-org/GLM-5.3-Flash`, `https://api.siliconflow.cn/v1`, request timeout 180000 ms, model concurrency 2 and response policy `deep`. The snapshot distinguishes actual container startup environment from exact-tag source constants; it does not claim to inspect mutable process environment or each constructed SDK request.
