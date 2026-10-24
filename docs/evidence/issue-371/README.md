# #371: smaller daily integration gate

Baseline: `190930ffbd6d2f14d6d2430b6e41e0bdd2373bb9`, formally published LingxiOS 3.8.11. Product behavior, package pins, database schema, repository protection and production configuration are unchanged.

## Selection and commands

The default is the seven-file list in `server/integration-suite.mjs`, covering signed identity/replay, tenant/project authorization, idempotent message and attachment delivery, Redis stream recovery, scoped history, real Worker public activity/history equality, and process-crash/receipt recovery. The database is shared and TRUNCATE-based, so files remain serialized.

```sh
# Requires INTEGRATION_DATABASE_URL naming a dedicated test DB and REDIS_URL.
npm run db:migrate
npm run test:integration                         # smoke, seven explicit files
npm run test:integration -- --mode smoke
npm run test:integration -- --file permission-resolver.test.ts
npm run test:integration -- --mode selected --file migration.test.ts
npm run test:integration -- --mode full          # every retained file + historical fixture
```

`INTEGRATION_TEST_MODE=smoke|selected|full` and `INTEGRATION_TEST_FILES` expose the same CI interface. Selected requires a nonempty list; full/smoke reject selected files. An empty default list selects smoke, never full. Unknown paths/modes and missing database/Redis configuration fail nonzero before tests; dedicated database safeguards remain. The realtime smoke receives the explicit Redis endpoint and cannot pass by skipping its required Redis check.

Ordinary server/shared changes run smoke, with a small owning-path table adding relevant tests. Changed test files run explicitly; deleted-only changes run smoke. Database/migration/formal server-package or historical fixture changes retain the five historical migration files plus the current runtime provenance check. Runtime, IM, authorization, learning and other feature paths add their stated owning checks. Full is explicit via `--mode full` or existing manual `deep-integration`; the latter also retains Redis-restart and empty-database Worker probes. Docs-only and frontend-only selection remain scoped.

Ordinary CI checks/integration have an eight-minute job cap; deep integration retains 30 minutes. Current-package files report individual monotonic wall times and exit codes; failing files stop the run. The result is written to `artifacts/ci-integration/timings.json` (override with `INTEGRATION_REPORT_PATH`) and uploaded even after a failed Actions run. Failed/cancelled required checks continue to block publication and deployment. No branch protection setting changed.

## Actual removal and consolidation

- Removed five pure source-string test files; retired `INTERVENTION` and separate `agent-os` assertions were already failing outside the daily list. Consolidated surviving knowledge network/R2 checks into the existing deployment case. Nine old cases removed/merged; five of those were daily cases. See [unit evidence](UNIT-PRUNING.md), including retained behavior and honest baseline failures.
- Combined avatar database constraints into the existing agents fixture. Combined numeric/diagram actions into one computed-actions fixture while keeping parse, authorization, execution/readback, cancellation, invalid reference and cross-run/revoked checks. Three old files removed, one merged file added; eight cases become five. Total integration files **119 → 117**. See [integration evidence](INTEGRATION-PRUNING.md).
- Net old test-file reduction: seven. Added focused runner/selection failure regressions rather than restoring the deleted test count. Long conversations, fault matrices and historical migrations remain available explicitly; moving these out of the default is reported separately from deletion.
- No speculative install/build speedup: existing Web/Admin build/typecheck branches were already mutually exclusive and remain unchanged.

## Measurements and checks

Baseline Actions [40058233189](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40058233189), integration job 120765899012: **15m18s job**, **13m37s integration step**, **66s install**. The original job log download returned Forbidden and zero bytes; it was not retried through another route, so no exact baseline case count is invented. This is a single observed baseline, not a p50/p90 claim. Queue, image publishing and production rollout are separate.

Local same-database, same-Redis, same-package consolidation comparison: old four files **23.899s, 8/8**, merged two files **13.095s, 5/5**, zero failures/skips: **45.21% less local wall time**. This is not the whole CI improvement.

Default smoke: **86.384s test execution / 86.490s enclosing command**, **7 files, 14/14 cases**, no skips or provider requests. Local Node was 24.19.0; Actions remains Node22, so its actual result is recorded separately. [Per-file measurements](LOCAL-SMOKE.json). The first attempt failed before test dispatch because a fractional millisecond timeout was rejected; the timeout is now an integer, and the original failure remains in operator evidence.

Other completed checks: server TypeScript and lint; Node22 server unit tests **129/129**, Web unit tests **124/124**; selector guards **7/7** and CI/release contracts **22/22**. Consolidated owning integration **5/5** and retained unit/deployment groups **12/12**. No repeated real-model qualification.

Exact candidate review, Actions before/after job/step and runner-minute comparison, merge status and final issue disposition are pending at this commit and will be recorded on the PR. The three-to-five-minute CI target is not claimed from the local smoke measurement alone.
