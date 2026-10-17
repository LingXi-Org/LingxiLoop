# Runtime reliability integration

Upstream PR24 merged at `b82787357cc9e7efa42bcdc3abec108f16e440b9`. The exact main release gate [39003363426](https://github.com/LingXi-Org/LingxiOS/actions/runs/39003363426) passed 416 tests with zero failures/skips, plus PostgreSQL stores, separate-process recovery, workspace/capacity, Linux image and sandbox qualification. [3.5.0 publication](https://github.com/LingXi-Org/LingxiOS/actions/runs/39003699289) succeeded and the product installed the exact registry package.

Joint regression found two upstream follow-ups: the four-child pending limit excluded the fifth starter-team member, and HTTP worker completion dropped classified terminal reasons. PR25 fixes both at `057b187d1307e15a2e2d9b399ce1cd9bf4a35d68`; [PR release gates](https://github.com/LingXi-Org/LingxiOS/actions/runs/39004909088) and [exact-main gates](https://github.com/LingXi-Org/LingxiOS/actions/runs/39005114124) passed 417/417, zero skips. Main merge is `c565f368f29268041c5cdc800f8f1b501923e297`. [3.5.1 publication](https://github.com/LingXi-Org/LingxiOS/actions/runs/39005408806) succeeded; schema12/migration014 are unchanged. The registry integrity is `sha512-gqxoYcQmwZJLTlx9xgg0W98xznPmKEB06Fi5OzTszouaHdc/TYmdTbhK66fFud0/8PLI7yoBkdODz4BCKrJAWg==`.

The product owns authorization, shared LLM ledger and WuKongIM delivery. It consumes public package exports for bounded model recovery, safe failure classification, passive Worker context services and the independent durable terminal outbox. Failed/cancelled work does not acquire a fabricated result. Stable terminal IDs use the existing send acceptance/reconciliation path; every attempt rechecks current principal, request and frozen audience. Terminal system messages suppress agent wake-up. Work state, committed result delivery and terminal feedback delivery remain separate in public projections.

## Migration

0043 is the only new product migration. Drain existing workers before applying: an unexpired leased work item rejects the upgrade. The runner verifies schema-11 metadata and installs the published migration014 inside the product transaction. Historical schema gates use the package's immutable public schema011 asset. Existing tasks, sessions, product data and accepted messages remain; historical terminal failures are not backfilled into new notifications. Fresh installation strips the package transaction wrapper so a later product failure rolls back the whole initial cutover. Repeating the migration is a no-op.

A schema-12 deployment is a forward upgrade. Do not start a 3.4.7 worker against schema12 or attempt a blind package-only rollback; use a reviewed forward fix. This document does not authorize production migration commands, security changes or a manual deployment.

## Repeatable cloud checks

```sh
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
npm run server:lint
npm run server:typecheck
npm run server:test
node e2e/server/run.mjs --file agent-protocols.test.ts --file available-capabilities.test.ts --file migration.test.ts --file runtime-reliability.test.ts --file native-authorization-faults.test.ts --file canvas-public-assignment.test.ts --file group-mentions.test.ts --file native-admission.test.ts --file runtime-model-context.test.ts --file runtime-nonthinking.test.ts --file runtime-provider-timeout.test.ts
node scripts/test-im-send-reconciliation.mjs --regression
node scripts/test-im-send-reconciliation.mjs --real-wukong
```

Use only the disposable PostgreSQL/Redis/WuKongIM harness. Database suites share the fixed integration database and must run sequentially. Browser checks use the existing Vite recovery fixture, `node --import tsx e2e/connection-recovery-server.mjs`, and the official runner:

```sh
E2E_RUNTIME_RELIABILITY=1 E2E_CONNECTION_RECOVERY=1 E2E_BASE_URL=http://127.0.0.1:5196 \
E2E_RECOVERY_EVIDENCE_DIR=.e2e/runtime-351-final/counts \
npm run test:e2e:web -- e2e/web/runtime-reliability.e2e.ts e2e/web/connection-recovery.e2e.ts --output .e2e/runtime-351-final --video on
```

Database suites share the fixed integration database. Each reliability browser server creates a separate disposable test database, because a global worker claim could otherwise consume an abandoned run from a previous invocation. The browser fixture supplies login and a deterministic HTTP provider, then uses the ordinary product API, chat transport/components, published runtime and real local WuKongIM. New-turn setup explicitly uses the public ingest API after the product accepts the human message; automatic ingress is covered separately by owning integration.

| Failure | Initial model calls | Required durable behavior |
| --- | ---: | --- |
| HTTP 402 | 1 | `model_unavailable`, one notice, no fake result |
| No provider response | 3 | bounded timeout, released HTTP requests, one notice |
| Irreducible context | 0 | `context_limit`, no futile compaction/model call |
| Reservation exceeds budget | 0 | `budget_limit`, no extra model allowance |
| User cancellation | 0 | `cancelled`, no automatic restart |

Each browser case rereads history, verifies the notification count remains one, and sends a new human message that succeeds with no active run or pending chat outbox. Counts record the terminal phase separately from the successful next turn. The child-fanout/atomic reservation matrix is covered by upstream PostgreSQL tests and the product five-specialist group-mention regression; the browser budget case exercises root reservation rejection, not a simulated multi-agent fanout.

Final 3.5.1 qualification is recorded in [validation.json](final-3.5.1/validation.json): lint/typecheck passed, server 106/106, 11 owning integration files 43/43 (including 26 migration checks), send reconciliation regression 27/27, real WuKong 20/20, and official browser run `01a1484c-4335-797d-96eb-57e90f11974e` 20/20. All these local checks had zero failures/skips. [HTTP provider timeout](final-3.5.1/provider-timeout.json) settled after 1,416 ms, three calls and three disconnected requests, with all ledger rows settled. The five-specialist introduction, input correction classification and cancellation-separated legacy receipt counts passed.

[Browser counts](final-3.5.1/counts), [26 screenshots](final-3.5.1/screenshots) and [20 videos](final-3.5.1/video) include the terminal phase and successful next turn; the validation manifest records SHA-256 for every retained artifact. A clean Web install added 1,458 packages using the same Electron-download skip as CI. The first plain install failed downloading the unused Electron development binary from GitHub; that download is not claimed as verified. Deterministic providers, component routes and local WuKongIM do not qualify a real provider, full SPA/session expiration, production traffic, retained-heap baseline or 24-hour soak.

## Deployment observation

Merged product PR164 automatic CD `38999121399`, PR169 CD `39002997223` and the final independent-package batch CD `39003344262` passed checks, image publication and manifest update, then failed connecting to Komodo `ops.christmas1314.xyz:443` (`UND_ERR_CONNECT_TIMEOUT`, 10 seconds). Failure occurred during the initial read before configuration synchronization or the rollout trigger. No deployment update ID was returned. No manual deployment, security change or protection bypass was performed. PR170's final CI and subsequent automatic CD are separate checks; only a successful Komodo update can establish production deployment.

## Remaining qualification

No fallback provider is enabled without an existing approved route and price/data-boundary authorization. Real provider credentials and production operational access must use existing authorized infrastructure; this work creates neither. #153 still requires paired same-production-image dialogue/load/retained-heap measurements, 24-hour soak and production update-state access; the merged foundation sampler alone does not satisfy those gates. Controlled real-provider validation for #155/#161 and complete SPA/fault-deployment acceptance remain open. Passing deterministic code gates does not close these issues or establish production acceptance.
