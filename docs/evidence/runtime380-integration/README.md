# Runtime 3.8 integration regression

Base: `d67f673bbb75e14cd74d1d6f501620d6d63c7cce`. The current CI log resource was denied; it was not retried or fetched by another route. The parent explicitly authorized one independent local integration run using the same repository command, formal runtime 3.8.0 and synthetic PostgreSQL/Redis/providers.

## Failure model recorded before correction

The local run reproduced `an empty database reaches the latest schema once and repeated migration is a no-op`. Its migration-return assertion already includes `0052_run_trace_provenance`, its second migration returns `[]`, and `assertMigrationsCurrent` succeeds. The subsequent independent exact `schema_migrations` row assertion omitted `{ version: 52, name: 'run_trace_provenance' }` and failed on that one extra actual row. This is an outdated expected history list, not evidence of a schema or idempotency fault.

The minimal correction must add exactly that expected row. Keep the explicit full history, repeat-migration assertion, native schema assertions and damaged-provenance rejection intact; do not generate expectations from actual database output, relax matching, modify migrations or runtime behavior.

## Results

The single original local round completed in 488.918 seconds: **106 files, 387 tests, 372 passed, 1 failed, 14 skipped** (live-provider gates), exit 1. Its only local failure was the row expectation above. The migration file had already finished before the one-line correction was applied; the remaining original round continued without changes to any other source. The same owning case then passed **1/1**, exit 0, in 1.338 seconds using a separate temporary database. The candidate full suite was not repeated; exact release CI remains the integrator's responsibility. Single-file Biome lint and complete diff check passed.

`results.json` binds before/after source and all raw local receipts by SHA256. The full original logs remain local under `/tmp/runtime380-local-integration/`; they are not included in the public commit. Existing generated tracked artifacts were restored. No schema/runtime/production code, locks or credentials changed. The denied GitHub log is still unavailable, so this proves the local defect rather than asserting the remote log's contents.

## Reproduce

Use Node 22, formal runtime 3.8.0 from the exact lock, isolated pgvector PostgreSQL 16 and Redis 7. Set the synthetic integration variables from `.github/workflows/ci.yml`, `DATABASE_URL`/`INTEGRATION_DATABASE_URL` to a dedicated test database, `OPENAI_BASE_URL=http://127.0.0.1:1/v1`, and a nonexistent `DOTENV_CONFIG_PATH`; do not inherit live-provider flags or real keys. Here the database was task-owned `runtime380_test` on loopback 32784 (tmpfs) and Redis on loopback 32785.

```sh
npm run verify:visualize
npm run build:visualize-runtime
node --import tsx server/src/migrate-bin.ts
npm run test:integration
# After the one-line fixture correction; no repeat full suite:
node --import tsx --experimental-test-module-mocks --test --test-reporter=tap --test-concurrency=1 --test-force-exit --test-name-pattern 'an empty database reaches the latest schema once and repeated migration is a no-op' server/src/__integration__/migration.test.ts
node node_modules/@biomejs/biome/bin/biome lint server/src/__integration__/migration.test.ts
```

Initial setup in `/workspace` hit ENOSPC before any suite run. An independent clone and all outputs were moved to `/tmp`; verify/build/migration then passed before the one authorized full round. No shared dependencies, other worktrees or production data were removed.
