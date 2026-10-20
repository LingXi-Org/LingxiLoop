# Current integration checkpoint

Updated2026-10-20 after formal3.5.8 qualification. The earlier checkpoint below
is retained as history and its pending-package/browser/rehearsal statements are
superseded by `formal358/README.md` and `runtime358/`.

- LingxiOS main35ac1208 passed exact main release gates39400184326 and formal
  publication39401752197. The four product manifests/locks pin3.5.8 and verified
  registry integrity; all474 installed package files match the source candidate.
- Formal package local checks:70/70 owning integration,34/34 migrations,69/69 Web,
  118/118 server,21/21 natural teardown,53/53 maintenance contracts, types,
  38/38 product browser and7/7 native editor browser.
- Live provider:1 scenario/9 behaviors,39 observed200 calls with measured usage,
  unchanged per-root budgets. Memory scopes/list/read/search and complete flow
  timings are separately reported; the historical207-second Abort is unresolved.
- Independently reviewed formal356→backup/restore→358/47→48 rehearsal passed5/5
  phases, preserves old data and proves compatible fix-forward. PR234 and235
  bounded evidence is integrated; #229 and unverified acceptance remain open.
- Initial exact-head PR236 CI found two stale scope-contract tests. Independent
  correction3aa256da passes4/4 with stricter privacy/revocation assertions; final
  CI/image remain pending. No production writes have occurred; both Web/API
  and Workers require the coordinator's outstanding maintenance confirmation.

## Historical09:26 checkpoint


Checkpoint: 2026-10-20 09:26 UTC. This is preparation, not a deployment receipt.
Production maintenance is paused pending the requested downtime/risk confirmation.
No production service has been stopped or migrated during this integration.

Fixed open set captured at09:12:10 UTC:
issues213,214,215,216,217,218,219,229; PRs223,224,225,231,232,233.
All membership pages and detailed comments/reviews/files/checks were read.

The product branch `integration/215-216-219-final` includes current main,
PR225, PR224→232, PR223→231→233, and the reviewed schema13 maintenance/backup
branch8e9db0ac. No original author branch was rewritten.
The no-op migration fix is3e49d9d48d9ea5df4bd8d07a2c758f5e8716cb50.
Its34 real migration checks,53 maintenance/backup contracts,65 Web smoke tests
and web/server types passed against a private source3.5.8 package.
Those are not formal registry-package or deployment qualifications.

Runtime PR37 repaired the image's missing schema012 resource without changing
isolation. Exact head2f7137aa57a46aa4e3a21f833fc6821de4a6a3e6 passed
[full release gates39398867319](https://github.com/LingXi-Org/LingxiOS/actions/runs/39398867319).
Main35ac1208fcf2bd6cb1852f474175e9eb7e2083ec has the identical tree; its
[required main gates39400184326](https://github.com/LingXi-Org/LingxiOS/actions/runs/39400184326)
were in progress at this checkpoint. Version3.5.7 is published but was not
deployed. Formal3.5.8, four exact product pins, final combination checks and
immutable application image remain release gates.

## #229 independent remaining work

Start from current mainc6c47bddeabb4488f9fe93391f15c695a528260c in an isolated
branch, retaining the current combination as an additional packaging consumer.
The shipped PR230 is explicitly a partial step. Its source-COPY decrease of
2,061,649 bytes must not be presented as a full OCI or source-repository saving.

Existing reproducible audit commands, from the candidate checkout:

```sh
node scripts/verify-zcode-visualize.mjs
node scripts/build-visualize-runtime.mjs
node --test scripts/production-rag-contract.test.mjs scripts/release-smoke.test.mjs
python3 docs/evidence/issue-229-runtime-payload/measure-payload.py BASE NEW_OUTPUT before
python3 docs/evidence/issue-229-runtime-payload/measure-payload.py CANDIDATE NEW_OUTPUT after
node docs/evidence/issue-229-runtime-payload/import-audit.cjs BASE NEW_IMPORT_REPORT.json
node docs/evidence/issue-229-runtime-payload/lock-audit.cjs BASE NPM_ARBORIST_PATH NEW_LOCK_OUTPUT
```

Those commands only reproduce the existing limited probe. Remaining hard scope:

1. Audit actual remaining source/dependency/rootfs consumers, including dynamic
   resources, and implement only proven obsolete/duplicate removals. Preserve
   full BlockNote input, native schema012/015, public APIs and the Python skill.
2. Measure complete source and production dependency file inventories and
   expanded bytes, complete `dist` assets/gzip/brotli, and full fixed-platform
   OCI compressed/uncompressed layers. Save base digests and exact lock inputs.
3. Measure complete cold/warm builds under the same cache policy and without
   concurrent browsers/builds; capture elapsed time and sampled peak disk.
   Use the existing Dockerfile's `npm_token` BuildKit secret with existing
   approved injection only. Do not copy credentials or publish/deploy from the
   parallel branch. Registry/base access failure is a limitation, not a pass.
4. Verify actual immutable image Web/Worker/migrate entrypoints and affected
   Visualize load/export paths. Preserve Worker isolation. An env-guard import
   probe or Vite page alone cannot qualify this.
5. Deliver minimal regression contracts, independent review and a draft PR.
   The sole integrator owns final CI/image, host inventory/approved recoverable
   cleanup and production acceptance. Do not prune shared caches or images.

See the complete original scope in issue229 and
`docs/evidence/issue-229-runtime-payload/README.md`.

## #214 / #217 / #218 independent remaining work

Use official `e2e@0.17.0` and `@e2e-dev/web@0.12.0`, a separate output directory
and port, and preserve the installed browser cache. No direct Playwright.

For #214, reproduce the35-test product combination using the config retained in
`docs/evidence/issue-214/integrated/ui-wave-combination/`.
The exact previous command is the `command` field in its `provenance.json`.
It deliberately excluded `official reference`; do not mistake it for completed
official-site comparison. The explicit normal-TLS reference command is:

```sh
E2E_PROJECT=web E2E_TELEMETRY_DISABLED=1 \
E2E_BASE_URL=https://www.assistant-ui.com E2E_OFFICIAL_STREAMING=1 \
npm run test:e2e:web -- e2e/web/streaming-text-official.e2e.ts --video on
```

Also review `e2e/web/run-activity.e2e.ts`'s official-reference case. Capture
matching viewport/theme/input/terminal/history states and native reduced-motion
behavior. A TLS failure must stay recorded; do not disable verification.

For #217, the concrete product suites are:

```sh
E2E_VISUALIZE_RESOURCE_DELAY=80 node_modules/.bin/e2e run --config e2e.visualize-loading.config.ts
node_modules/.bin/e2e run --config e2e.visualize-retention-213-217.config.ts
E2E_VISUALIZE_RESOURCE_DELAY=1200 node_modules/.bin/e2e run \
  --config e2e.visualize-213-217.config.ts e2e/visualize/presentation-213-217.e2e.ts
```

Do performance comparisons serially. The retained actual-provider suite is
`server/src/__integration__/visualize-trigger-live.test.ts`, opt-in
`LINGXIOS_LIVE_VISUALIZE_TRIGGER=1`; see the exact isolated database and
unchanged budget instructions in `docs/evidence/issue-213-217/ACCEPTANCE.md`.
It previously yielded6 succeeded/1 partial. The comparison output's500-yuan
crossover and n=20 label were wrong (crossover should be about166.67).
Determine and fix a reproducible product-owned defect, then rerun actual
provider verification without altering saved responses or widening budgets.
The original native Clipboard write was denied; don't silently grant permissions
or turn its retained denial into a pass. Real hardware touch remains uncovered.
Arbitrary HTML streaming remains unsupported; the issue permits an honest
upstream capability boundary/alternative, not a claim of implemented streaming.

For #218, review the79 product+18 native action mapping in
`docs/evidence/issue-215-218/type-map.md`, real provider/context ownership in
`source-review.md`, and rerun:

```sh
node e2e/web/run.mjs --config e2e.ui-release-check.config.ts \
  e2e/web/activity-presentation.e2e.ts e2e/web/activity-regressions.e2e.ts \
  e2e/web/run-activity.e2e.ts e2e/web/memory-privacy.e2e.ts \
  --output artifacts/NEW_ACTIVITY_ACCEPTANCE
```

The retained config must first be copied to the repository root; serve the
fixture with matching `E2E_ACTIVITY_FIXTURE=1` and
`E2E_MEMORY_PRIVACY_FIXTURE=1` flags. Final real HTTP/runtime forget, revoke,
cross-run cache invalidation and history belong to the integrator's216 combo.
Coordinate that handoff rather than duplicating package/lock/migration changes.

## Maintenance boundaries

Both Web/API instances and Workers must stop for native12→13; queued durable
state is preserved. The window includes backup+isolated restore, migration and
new-version startup. No production backup timing or recovery receipt exists yet;
configured timeout ceilings are not an estimated outage.
After0047/native13 commits, including0048 failure, use compatible fix-forward.
Do not restart3.5.6 instances or rerun an uncertain maintenance attempt.
