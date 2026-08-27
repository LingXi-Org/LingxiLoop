---
name: lingxiloop-db-change
description: "Implement, refactor, debug, or review LingxiLoop PostgreSQL DDL, v1 schema bootstrap, SQL persistence, indexes, transactions, tenant authorization, or data lifecycle behavior. Use for database changes, 数据库初始化, SQL 改动, 租户隔离, or 索引优化."
---

# Change the LingxiLoop Database

Preserve tenant isolation, retry safety, and the reset-only v1 database boundary. Treat `server/src/db/schema.sql` as the canonical schema and `server/src/db/bootstrap.ts` as the only bootstrap/integrity entry point. LingxiLoop does not upgrade existing databases in place.

## Ground the change

Read the changed persistence callers, `server/src/db/pool.ts`, the relevant `schema.sql` section, `bootstrap.ts`, and existing integration fixtures. Read `docs/RELEASE.md` for reset or destructive schema work.

Read [references/database-contracts.md](references/database-contracts.md) before changing DDL, tenant-owned queries, indexes, backfills, migration control flow, or retryable multi-write behavior.

Map:

- the table owner and tenant key;
- every read/write caller and authorization source;
- transaction and retry boundaries;
- uniqueness, foreign key, and deletion behavior;
- empty-database bootstrap, already-ready assertion, incomplete-schema rejection, reset, and rollback behavior;
- query shape and supporting index for growing or hot tables.

## Implement

- Parameterize values. Never interpolate user, tenant, agent, table, column, or sort input unless the identifier comes from a closed internal allowlist.
- Derive tenant scope from authenticated membership or trusted service context and constrain every tenant-owned operation by `company_id` or an owning join.
- Put state changes that must agree in one transaction. Make retryable external effects use durable idempotency rather than timing assumptions.
- Keep all canonical DDL in `schema.sql`; Web, Worker, and Agent OS processes must only assert readiness and never create or alter schema.
- Add every latest required object to the `bootstrap.ts` completeness check so a marked but incomplete database fails closed.
- Do not add runtime migrations, startup backfills, upgrade compatibility columns, or dual-write paths. An older or unmarked database must be dropped and bootstrapped again.
- Keep correctness-required constraints fatal. Evaluate large indexes before adding them to the empty-database bootstrap.
- Make destructive or one-way data changes explicit, evidence-backed, and compatible with the documented backup/rollback boundary. Do not invent a dual-write path.
- Update typed surfaces, tests, operator docs, cleanup order, and seed/reset fixtures when their contract changes.

## Verify

Add behavior tests that would fail for missing tenant predicates, wrong joins, duplicate retries, partial commits, and unsafe deletion. For schema work, verify an empty database initializes completely, a ready v1 database is accepted read-only, and incomplete or legacy schemas are rejected with reset guidance.

Use `$lingxiloop-verify-change` to select the exact set. Database changes normally require:

```text
npm run server:typecheck
npm test
npm run test:integration
```

Run the focused v1 schema tests when bootstrap or integrity behavior changes. Run Agent OS/LLM guards when the persisted contract belongs to those paths. If PostgreSQL, Redis, extensions, or production-sized data are unavailable, report that limitation and the CI or staging evidence still required.
