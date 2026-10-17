# Runtime reliability integration

Upstream PR24 merged at `b82787357cc9e7efa42bcdc3abec108f16e440b9`. The exact main release gate [39003363426](https://github.com/LingXi-Org/LingxiOS/actions/runs/39003363426) passed 416 tests with zero failures/skips, plus PostgreSQL stores, separate-process recovery, workspace/capacity, Linux image and sandbox qualification. Tag `v3.5.0` targets that commit. Product installation is permitted only after the existing package publish workflow succeeds and registry integrity is verified.

The product owns authorization, shared LLM ledger and WuKongIM delivery. It consumes public package exports for bounded model recovery, safe failure classification, passive Worker context services and the independent durable terminal outbox. Failed/cancelled work does not acquire a fabricated result. Stable terminal IDs use the existing send acceptance/reconciliation path; every attempt rechecks current principal, request and frozen audience. Terminal system messages suppress agent wake-up. Work state, committed result delivery and terminal feedback delivery remain separate in public projections.

## Migration

0043 is the only new product migration. Drain existing workers before applying: an unexpired leased work item rejects the upgrade. The runner verifies schema-11 metadata and installs the published migration014 inside the product transaction. Historical schema gates use the package's immutable public schema011 asset. Existing tasks, sessions, product data and accepted messages remain; historical terminal failures are not backfilled into new notifications. Fresh installation strips the package transaction wrapper so a later product failure rolls back the whole initial cutover. Repeating the migration is a no-op.

A schema-12 deployment is a forward upgrade. Do not start a 3.4.7 worker against schema12 or attempt a blind package-only rollback; use a reviewed forward fix. This document does not authorize production migration commands, security changes or a manual deployment.

## Repeatable cloud checks

```sh
npm ci
npm run server:lint
npm run server:typecheck
npm run server:test
node e2e/server/run.mjs --file migration.test.ts --file runtime-reliability.test.ts
node e2e/server/run.mjs --file native-authorization-faults.test.ts --file canvas.test.ts --file group-mention.test.ts --file runtime-budget.test.ts
node scripts/test-im-send-reconciliation.mjs --regression
node scripts/test-im-send-reconciliation.mjs --real-wukong
```

Use only the disposable PostgreSQL/Redis/WuKongIM harness. Database suites share the fixed integration database and must run sequentially. Browser checks use the existing Vite recovery fixture, `node --import tsx e2e/connection-recovery-server.mjs`, and the official runner:

```sh
E2E_RUNTIME_RELIABILITY=1 E2E_BASE_URL=http://127.0.0.1:5196 \
E2E_RECOVERY_EVIDENCE_DIR=.e2e/runtime-reliability/counts \
npm run test:e2e:web -- e2e/web/runtime-reliability.e2e.ts --output .e2e/runtime-reliability --video on
```

These commands are a pending qualification plan until results below are recorded. Deterministic providers, component routes and local WuKongIM do not qualify a real provider, full SPA/session expiration, production traffic, retained-heap baseline or 24-hour soak.

## Deployment observation

Merged product PR164 automatic CD `38999121399` and PR169 CD `39002997223` passed checks, image publication and manifest update, then failed connecting to Komodo `ops.christmas1314.xyz:443` (`UND_ERR_CONNECT_TIMEOUT`, 10 seconds). Failure occurred during the initial read before configuration synchronization or the rollout trigger. No deployment update ID was returned. No manual deployment, security change or protection bypass was performed.

## Remaining qualification

Formal 3.5.0 registry install, product type/integration/browser results and final product PR CI remain pending here. No fallback provider is enabled without an existing approved route and price/data-boundary authorization. Real provider credentials and production operational access must use existing authorized infrastructure; this work creates neither.
