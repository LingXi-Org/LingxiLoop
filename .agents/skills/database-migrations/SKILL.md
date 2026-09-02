---
name: database-migrations
description: Implement or review LingxiLoop PostgreSQL schema changes, migration runner behavior, migration readiness, or deployment sequencing. Use for any change to product tables, indexes, constraints, policies, extensions, or server/src/db/migrations. Do not use for the vendored Open Notebook/SurrealDB schema.
---

# Database migrations

Treat `server/src/db/migrations/0001_v1_baseline.sql` as immutable. Inspect existing migrations and every affected query before changing the schema.

## Implement

1. Add exactly one next-numbered `NNNN_descriptive_name.sql`; never edit an existing migration.
2. Make the change forward compatible. Use expand/backfill/contract across migrations when old and new processes may overlap.
3. Keep the migration transactional. Avoid unbounded locks and prove new constraints against existing rows before enforcing them.
4. Preserve foreign keys, tenant/project ownership, RLS or equivalent authorization, timestamps, and ledger invariants.
5. Update application code only after the new schema is safe for it. Runtime startup may call `assertMigrationsCurrent` but must not execute DDL.

## Verify

- Add or update an integration case for the changed behavior; do not replace behavior coverage with SQL regex tests.
- Run `npm run server:typecheck`, `npm run db:migrate`, and `npm run test:integration -- --file migration.test.ts` plus only affected domain integration files against PostgreSQL and Redis.
- Confirm a second `npm run db:migrate` is a no-op and the migration history checksum is unchanged.
- Report rollout ordering, backfill needs, and whether old binaries remain compatible.

Never auto-register a legacy non-empty database. Operations must rebuild it empty before the migration runner is used.
