# Development continuation without deployment

The user explicitly removed deployment from this work. The existing deployment
service is intentionally offline. No Komodo probe, production operation or
manual deployment is required or performed by this continuation. Development,
CI, isolated failure injection and ordinary PR merges remain in scope.

## Reviewed scope and concrete repairs

| Issue | Reviewed path | Development result |
| --- | --- | --- |
| #153 | Active/passive runtime ownership, bounded background connections/notifications, Web/Worker separation, PG pool and timeouts, live/ready probes, gateway idempotency boundary, metrics | No additional code defect found in this review. Existing paired Web/API measurement and the original uninterrupted soak remain valid only for their recorded 3.5.1 image. Dialogue-load/retained-heap and product Worker qualification remain separate. |
| #155 | Chat, auxiliary/embedding calls, shared attempt/deadline policy, cancellation, circuits, fallback authorization/pricing, usage settlement | Found and repaired outer model-deadline classification and missing semantic-memory embedding classification/circuit protection. Embeddings retain a fixed vector-space key; quota rejection including HTTP429 insufficient_quota is not hot-retried across jobs. |
| #157 | Atomic child/closing holds, sibling reservations, costs, deadline, fanout limits, denial aggregation and next-turn isolation | Added settled near-limit cost coverage: repeated settlement charges once; insufficient startup plus closing allowance creates no child. This uses actual budget-store settlement with controlled pricing/usage, not a live supplier invoice. |
| #161 | Atomic terminal outbox, request-version/root identity, fencing, result vs terminal delivery, authorization, client projection, next-turn admission | Product integration reproduced the old total-timeout defect (execution_failed instead of model_unavailable). Added a next-turn/one-notice/settled-usage/transport-disconnect regression. Further review caught delayed ledger settlement overwriting the first deadline; the combined signal's first reason now remains authoritative. |

The product now installs the published **3.5.2/schema12**, without another migration.
Both root and independent server manifests/locks use the same registry integrity.
LingxiOS [PR26](https://github.com/LingXi-Org/LingxiOS/pull/26) contains the
classification/embedding repair; [PR27](https://github.com/LingXi-Org/LingxiOS/pull/27)
finishes deadline ordering. Product [PR174](https://github.com/LingXi-Org/LingxiLoop/pull/174)
adds public-package qualification and the development-only merge control.
Only exact published public exports may be installed by the product.

## Deployment exclusion is tested

A merge commit containing `[skip deploy]` preserves ordinary checks and
immutable image publication, but blocks `update-manifests`, Cloudflare `deploy`
and Komodo `rollout`. The test evaluates the actual workflow job conditions,
including failed/cancelled gates and the default publication behavior. It was
red before implementation and all 18 contract checks passed after repair.
The marker does not bypass tests or branch protection. Product PR174 is required to be
merged with that marker; skipped deployment is expected, not a success receipt.

## Current evidence

[Development checks](development-checks.json) retain the red test facts and
qualified upstream run identifiers. The initial 3.5.1 product integration failed
with expected `model_unavailable`, actual `execution_failed`, both locally and
in CI. This failure is an acceptance guard, not a test to disable.

The PR26 gate passed 421/421; PR27 and its exact main commit both passed
422/422 with zero failures/skips, including PostgreSQL, separate-process crash
recovery, distributed workspace/capacity and the confined Linux image. Main
`e09fc03437804ec80bc2f6d6b3258dc3e2f35540` is bound to release-gates
[39015169232](https://github.com/LingXi-Org/LingxiOS/actions/runs/39015169232).
The existing [publish-package39015407648](https://github.com/LingXi-Org/LingxiOS/actions/runs/39015407648)
repeated package checks (422/422), validated that main receipt and published
`v3.5.2`. Public `releaseVersions` reports runtime3.5.2/schema12. Local standalone
package qualification also passed after selecting the existing writable warmed
npm cache; its earlier cache-environment failures remain recorded.

Product owning checks: **106/106 server tests**, lint/typecheck, **18/18**
deployment contracts, **17 passed / 1 prerequisite skip** in the broad runtime
integration selection, and **20/20** in the dedicated real-WuKong runner that
subsequently qualified the skipped receipt-recovery case. The official browser
selection passed **11/11, zero skips**, covering nine runtime cases and two rapid
identity/session cases. Counts and log hashes are in
[development-checks.json](development-checks.json); [browser report](browser/report.json),
[screenshots](browser/screenshots), [videos](browser/video),
[deadline counters](deadline.json) and [real-WuKong counters](real-wukong-recovery.json)
retain the repeatable results. The real-WuKong result repair keeps one send, one
message, the same result/message identities and unchanged model/action accounting. The new deadline integration
first failed on published 3.5.1 and passes on published 3.5.2: one outbound failing
request, one disconnected transport, one settled ledger entry, one persistent
failure notice and a successful next turn. The browser evidence uses actual
product API/public Worker, PostgreSQL and WuKongIM with an explicitly synthetic
model and fixture login; it does not claim full-SPA or live-provider qualification.

## Reproduce the public-package qualification

Use Node22, install the exact manifests with `npm ci` through the existing
package-registry identity, and use the repository's disposable test services.
Do not load production/provider environment files. Run:

```sh
npm run server:lint
npm run server:typecheck
npm run server:test
node --test scripts/production-rag-contract.test.mjs
node e2e/server/run.mjs --file runtime-deadline-recovery.test.ts --file runtime-provider-timeout.test.ts --file runtime-reliability.test.ts --file runtime-tool-recovery.test.ts --file native-authorization-faults.test.ts --file group-mentions.test.ts --file runtime-model-context.test.ts --file runtime-compaction.test.ts --file runtime-nonthinking.test.ts --file runtime-response-policy.test.ts --file im-send-runtime-recovery.test.ts
node scripts/test-im-send-reconciliation.mjs --real-wukong
```

Start `E2E_RUNTIME_RELIABILITY=1 node --import tsx e2e/connection-recovery-server.mjs`
and a Vite fixture on5196 with `LINGXILOOP_DEV_API_TARGET=http://127.0.0.1:5199`.
Then run the official tester-army engine:

```sh
E2E_RUNTIME_RELIABILITY=1 E2E_CONNECTION_RECOVERY=1 \
E2E_BASE_URL=http://127.0.0.1:5196 \
E2E_RECOVERY_EVIDENCE_DIR=.e2e/runtime-development-final/counts \
PLAYWRIGHT_BROWSERS_PATH=/workspace/.lingxi-setup/cache/ms-playwright \
npm run test:e2e:web -- e2e/web/runtime-reliability.e2e.ts e2e/web/connection-recovery.e2e.ts \
  --grep 'Durable runtime failure recovery|rapid identity|rapid logout' \
  --output .e2e/runtime-development-final --video on
npm run test:e2e:typecheck
```

## Original soak continues

The observation began **2026-10-17T06:42:47.900Z** and cannot finish before
**2026-10-18T06:42:47.901Z**. Monitor PID **285092** has not restarted.
At 07:44 UTC only the evidence watcher was replaced with PID **363050**, after
the default CLI identity expired. It uses an already-injected identity with
verified repository access; no token was created, persisted or expanded.

- Local state: `/workspace/LingxiLoop-acceptance/.e2e/image-acceptance/soak/state.json`.
- Logs: `/tmp/acceptance-soak.log` and `/tmp/acceptance-soak-watch.log`.
- Remote hourly/final evidence: [codex/runtime-soak-evidence](https://github.com/LingXi-Org/LingxiLoop/tree/codex/runtime-soak-evidence/docs/evidence/runtime-measurements/soak).
- Independent follow-up remains scheduled for **2026-10-18 06:50 UTC**.

This is the original immutable **3.5.1 Web/API-only** image; neither the new
package nor this watcher replacement changes its claimed version, scope or
start time. A terminal receipt, at least 86,400 seconds, continuous heartbeats
and zero violations are required. Missing/stale evidence is incomplete.

## Precise remaining external qualifications

No deployment credential or service restoration is needed for development.
For a controlled live-provider run, the existing cloud environment must contain
an authorized `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_API_KEY`, approved data
boundary and input/output prices (`AGENT_OS_INPUT_COST_MICROS_PER_MILLION`,
`AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION`), with explicit call/token/cost limits.
An alternate route must already be approved and satisfy the public fallback
capability/pricing/authorization contract. Never send keys in chat, create an
account/token or enable a route merely to satisfy a test. No such usable provider
configuration was supplied, so live-provider and live-billing claims remain
unverified for #155/#157/#161.

The current executor cannot create bubblewrap user namespaces. Product Worker
qualification requires an existing authorized cloud executor/kernel supporting
the configured isolation. The upstream CI's confined package image and local
native-only fixtures do not certify this executor as a production Worker.
Do not use privileged/unconfined mode or alter production security settings.
The cancelled production deployment work is outside scope, not an open coding
blocker and not an implied acceptance pass.
