# Runtime reliability integration

Upstream PR24 merged at `b82787357cc9e7efa42bcdc3abec108f16e440b9`. The exact main release gate [39003363426](https://github.com/LingXi-Org/LingxiOS/actions/runs/39003363426) passed 416 tests with zero failures/skips, plus PostgreSQL stores, separate-process recovery, workspace/capacity, Linux image and sandbox qualification. [3.5.0 publication](https://github.com/LingXi-Org/LingxiOS/actions/runs/39003699289) succeeded and the product installed the exact registry package.

Joint regression found two upstream follow-ups: the four-child pending limit excluded the fifth starter-team member, and HTTP worker completion dropped classified terminal reasons. PR25 fixes both at `057b187d1307e15a2e2d9b399ce1cd9bf4a35d68`; [PR release gates](https://github.com/LingXi-Org/LingxiOS/actions/runs/39004909088) and [exact-main gates](https://github.com/LingXi-Org/LingxiOS/actions/runs/39005114124) passed 417/417, zero skips. Main merge is `c565f368f29268041c5cdc800f8f1b501923e297`. [3.5.1 publication](https://github.com/LingXi-Org/LingxiOS/actions/runs/39005408806) succeeded; schema12/migration014 are unchanged. The registry integrity is `sha512-gqxoYcQmwZJLTlx9xgg0W98xznPmKEB06Fi5OzTszouaHdc/TYmdTbhK66fFud0/8PLI7yoBkdODz4BCKrJAWg==`.

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
node e2e/server/run.mjs --file native-authorization-faults.test.ts --file canvas-public-assignment.test.ts --file group-mentions.test.ts --file native-admission.test.ts
node scripts/test-im-send-reconciliation.mjs --regression
node scripts/test-im-send-reconciliation.mjs --real-wukong
```

Use only the disposable PostgreSQL/Redis/WuKongIM harness. Database suites share the fixed integration database and must run sequentially. Browser checks use the existing Vite recovery fixture, `node --import tsx e2e/connection-recovery-server.mjs`, and the official runner:

```sh
E2E_RUNTIME_RELIABILITY=1 E2E_BASE_URL=http://127.0.0.1:5196 \
E2E_RECOVERY_EVIDENCE_DIR=.e2e/runtime-reliability/counts \
npm run test:e2e:web -- e2e/web/runtime-reliability.e2e.ts --output .e2e/runtime-reliability --video on
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

Initial 3.5.0 qualification: server 106/106, migration 26/26, optional-context/terminal authorization 3/3, native admission and lost-ACK replay 1/1, browser matrix 5/5. Final 3.5.1 results must be recorded below before product merge. Deterministic providers, component routes and local WuKongIM do not qualify a real provider, full SPA/session expiration, production traffic, retained-heap baseline or 24-hour soak.

## Deployment observation

Merged product PR164 automatic CD `38999121399` and PR169 CD `39002997223` passed checks, image publication and manifest update, then failed connecting to Komodo `ops.christmas1314.xyz:443` (`UND_ERR_CONNECT_TIMEOUT`, 10 seconds). Failure occurred during the initial read before configuration synchronization or the rollout trigger. No deployment update ID was returned. No manual deployment, security change or protection bypass was performed.

## Remaining qualification

Final 3.5.1 registry install, repeated product integration/browser results and final product PR CI remain pending here. No fallback provider is enabled without an existing approved route and price/data-boundary authorization. Real provider credentials and production operational access must use existing authorized infrastructure; this work creates neither. #153 still requires paired same-production-image dialogue/load/retained-heap measurements, 24-hour soak and production update-state access; the merged foundation sampler alone does not satisfy those gates.
