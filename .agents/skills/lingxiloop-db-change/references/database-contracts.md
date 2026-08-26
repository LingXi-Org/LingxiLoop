# LingxiLoop Database Contracts

Apply only the sections reached by the change, and confirm current implementation details before editing.

## Schema authority and boot

- `server/src/db/migrate.ts` contains the effective PostgreSQL DDL and boot migration behavior.
- `server/src/db/schema.ts` supplies selected Drizzle types; it is not a complete catalog of production columns or constraints.
- `ensureSchema()` uses one session-scoped advisory lock to serialize migrators. The same connection must release it cleanly.
- The advisory lock does not protect against live traffic. Keep the bounded DDL `lock_timeout` and boot retry behavior for `40P01` and `55P03`.
- `schemaAlreadyCurrent()` may forgive a lock-contention failure only when all newest required objects exist. Update its sentinels in the same change as each new required table, column, constraint, or index.
- Extensions and performance-only indexes may degrade gracefully only where application correctness has an explicit fallback.

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

## Migration shapes

- Prefer additive, idempotent DDL and explicit data transformations. Use `IF NOT EXISTS` only when the existing object's shape is independently guaranteed.
- Make required backfills deterministic and restart-safe. Record progress or use conflict-safe predicates when one transaction is not credible.
- Do not place a large ordinary `CREATE INDEX` on a hot table in the main DDL batch. Use `CREATE INDEX CONCURRENTLY` outside a transaction, remove invalid remnants, and keep it non-fatal only when it is performance-only.
- Explain and test any nullable compatibility column or retained legacy field. Do not preserve dead schema by default.
- For destructive cutovers, verify backup inputs and rollback restoration. Rollback may restore pre-cutover state; it need not reactivate retired runtimes.

## Evidence

- Unit-test parsing, retry classification, and pure query-building behavior where applicable.
- Integration-test schema creation, representative upgrade data, idempotent rerun, tenant-negative access, constraints, and transaction rollback.
- Exercise multi-replica or lock behavior with targeted mocks/tests when a reliable live concurrency reproduction is impractical.
- Inspect query plans or production-like row counts before claiming an index or query change solves a performance problem.
