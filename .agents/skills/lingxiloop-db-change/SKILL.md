---
name: lingxiloop-db-change
description: "Implement, refactor, debug, or review LingxiLoop PostgreSQL DDL, runtime migrations, SQL persistence, indexes, backfills, transactions, tenant authorization, or data lifecycle behavior. Use for database changes, 数据库迁移, SQL 改动, 租户隔离, 数据回填, or 索引优化."
---

# Change the LingxiLoop Database

Preserve tenant isolation, retry safety, and multi-replica boot behavior. Treat `server/src/db/migrate.ts` as the operational schema and migration source; `server/src/db/schema.ts` is a partial typed surface and must not be assumed complete.

## Ground the change

Read the changed persistence callers, `server/src/db/pool.ts`, the relevant migration section, and existing integration fixtures. Read `docs/RELEASE.md` for cutover or destructive migration work.

Read [references/database-contracts.md](references/database-contracts.md) before changing DDL, tenant-owned queries, indexes, backfills, migration control flow, or retryable multi-write behavior.

Map:

- the table owner and tenant key;
- every read/write caller and authorization source;
- transaction and retry boundaries;
- uniqueness, foreign key, and deletion behavior;
- fresh install, already-current, upgrade, concurrent boot, and rollback behavior;
- query shape and supporting index for growing or hot tables.

## Implement

- Parameterize values. Never interpolate user, tenant, agent, table, column, or sort input unless the identifier comes from a closed internal allowlist.
- Derive tenant scope from authenticated membership or trusted service context and constrain every tenant-owned operation by `company_id` or an owning join.
- Put state changes that must agree in one transaction. Make retryable external effects use durable idempotency rather than timing assumptions.
- Shape boot DDL to be idempotent. Preserve the advisory-lock and bounded live-traffic lock behavior.
- Add every latest required object to `schemaAlreadyCurrent`; otherwise lock-contention fallback can incorrectly skip the migration.
- Keep correctness-required constraints and data transformations fatal. Build large performance-only indexes concurrently, outside the main migration transaction, and non-fatally when boot correctness does not depend on them.
- Make destructive or one-way data changes explicit, evidence-backed, and compatible with the documented backup/rollback boundary. Do not invent a dual-write path.
- Update typed surfaces, tests, operator docs, cleanup order, and seed/reset fixtures when their contract changes.

## Verify

Add behavior tests that would fail for missing tenant predicates, wrong joins, duplicate retries, partial commits, unsafe deletion, and re-running a migration. For schema work, verify both a fresh database and representative pre-existing rows; rerun the idempotent path.

Use `$lingxiloop-verify-change` to select the exact set. Database changes normally require:

```text
npm run server:typecheck
npm test
npm run test:integration
```

Run the focused migration boot-retry test when retry or lock handling changes. Run Agent OS/LLM guards when the persisted contract belongs to those paths. If PostgreSQL, Redis, extensions, or production-sized data are unavailable, report that limitation and the CI or staging evidence still required.
