# Reader3.7 owning migration-fixture correction

Base37b8d70d211da4e1b44a6ff35ddf4e4d532ada47. Exact CI39637300381 had passing server/deployment checks and a failed integration job119351458581. These two local PostgreSQL failures match the reported integration failures; no product guard defect is assumed.

Only migration.test.ts changes:
- Keep the recorded runtime-patch repair case, restricted to historical range28/native11. Its ledger stays at28; repair from stale native10 restores the exact prior runtime/schema/protocol/hash and readiness, without recording another migration.
- Add the current full51 counterpart: after native/provenance damage, both migration repeat and startup reject. Installation rows including timestamps, complete ledger/checksums/timestamps and native version remain unchanged after each attempt.
- Concurrent migrators retain the full ordered result plus an empty result; ledger count is correctly51.

Failure model recorded before edits. `red.log` reproduces both original failures0/2; `green.log` passes the three owning cases3/3 in2.61s. `lint.log` passes the changed test file; diff-check passes. An initial sparse checkout lacked imported src/lib files and stopped before tests; sparse-import-failure.log is preserved separately. No test result was claimed from that setup failure.

Node22.23.3, actual formal3.7 package at /workspace/public-purpose-contract/formal370/node_modules/@lyyzka/lingxios, reused through /workspace/LingxiLoop-public-purpose-reader/node_modules. Runtime source overlays were not used. Cached pgvector/pg16 ran in task-owned256MiB tmpfs, loopback32780, database reader_fixture_test. Container lingxi-reader-fixture-pg was stopped and auto-removed after testing. Only synthetic local fixture data was used; no provider/browser/production API or private diagnostics. No broad suite rerun.

Reproduce against a dedicated local test database with DATABASE_URL and INTEGRATION_DATABASE_URL set to that URL, the existing synthetic integration environment, and:

```
node --import tsx --test --test-name-pattern 'a historical recorded runtime patch repairs|a recorded reader upgrade rejects|concurrent migrators serialize' server/src/__integration__/migration.test.ts
```

Runtime/migration/profile SQL, producer state, dependencies and release scripts are byte-unchanged. PR288/runtime3.8 is untouched; its future integration must deliberately advance the two latest-inventory51 expectations to52. Root owns review, exact CI, merge and deployment.
