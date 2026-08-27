# LingxiLoop Database Contracts

Apply only the sections reached by the change, and confirm current implementation details before editing.

## Schema authority and boot

- `server/src/db/schema.sql` contains the complete immutable v1 PostgreSQL schema.
- `server/src/db/bootstrap.ts` accepts only an empty schema or an already-marked, complete v1 schema. It never alters, backfills, or upgrades existing relations.
- `npm run db:bootstrap` is the explicit initialization entry point. Web, Worker, and Agent OS startup only assert schema readiness.
- Update the v1 completeness query with every required table or critical column. A marked but incomplete schema must fail closed.
- Legacy or unmarked databases are reset, not upgraded in place. Keep operator guidance explicit about drop/recreate and backup boundaries.

## Tenant and authorization

- Treat `company_id` as part of the ownership identity for tenant data even when another identifier appears globally unique.
- Resolve company membership server-side. A request body, URL, webhook, model call, or CLI argument does not establish authorization.
- Constrain reads, updates, deletes, joins, conflict targets, cache keys, event publication, and background sweeps by the owning tenant relationship.
- Validate both ends of tenant-owned links. A foreign identifier that exists in another tenant must be rejected, not silently linked.
- Test the same identifier or plausible collision in two companies. Positive single-tenant coverage cannot prove isolation.

## Transactions, retries, and lifecycle

- Use one transaction for state that must publish or roll back together, such as webhook receipt plus work enqueue or mutation plus append-only audit event.
- Acquire row locks or use conditional updates when concurrent writers compete for a state transition.
- Give retryable side effects durable idempotency keys and terminal states. A process crash after the sink succeeds must not duplicate the effect.
- Preserve cleanup and foreign-key order in integration reset helpers, retention workers, account deletion, and one-way cutovers.
- Distinguish correctness data from caches, projections, and optimization indexes; their failure and recovery policies need not match.

## V1 schema shapes

- Put every required object and constraint in `schema.sql`; do not spread effective DDL across process startup paths.
- Do not add runtime backfills, compatibility columns, dual writes, or migration directories for pre-v1 data.
- Preserve generated columns as generated; callers must not explicitly insert into them.
- Evaluate indexes against expected production shape, but remember bootstrap runs only against an empty database.
- For destructive resets, verify backup inputs and rollback restoration. Rollback may restore a prior database snapshot; it does not imply an in-place upgrade path.

## Evidence

- Unit-test parsing, retry classification, and pure query-building behavior where applicable.
- Integration-test empty schema creation, ready-schema assertions, legacy/incomplete-schema rejection, tenant-negative access, constraints, and transaction rollback.
- Verify Web, Worker, and Agent OS do not execute DDL or startup backfills.
- Inspect query plans or production-like row counts before claiming an index or query change solves a performance problem.
