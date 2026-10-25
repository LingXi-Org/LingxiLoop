# Versioned logical case deletion (#451)

Managers can delete a draft, published or unpublished case from the management
list or detail menu. The confirmation names the case and explains that its links
and attachments become inaccessible. Cancellation performs no mutation; request
failures preserve the item and allow retry; success removes it and returns detail
to the current filtered management list.

`DELETE /cases/:id` accepts the current `{version}` and responds with
`200 {deleted:true,id}`. The existing HTTP client expects acknowledged JSON.
Organization scope, management permission, current version and transaction locks
are enforced server-side. Soft deletion retains lifecycle history, snapshots,
attachments and cover assets. Lists/detail, direct files and cover endpoints
exclude tombstones. Existing knowledge-source invalidation and cover cancellation
prevent retained indexes, queued jobs and late workers from restoring access.
Derived knowledge assets retain the existing cleanup policy.

Migration: `0057_case_soft_delete.sql` (nullable `deleted_at`, runner-owned
transaction, bounded lock timeout). SHA-256: `f42124684d66f1387267f6da653ec2b255c2fa4a9f6dccd6179a3a5fbb4607a0`.
The runtime migration detector recognizes the complete product57 inventory while
retaining exact published LingxiOS 3.8.12, schema14 and manifest/lock provenance.

## Executed local checks

- 31/31 integration checks: organization cases15, covers13, product55 migration2,
  product57 migration1. [Receipt](backend-integration.log).
- 8/8 runtime boundary checks. [Receipt](runtime-profile.log).
- Server typecheck passed. [Receipt](backend-typecheck.log).
- Migration coverage proves empty installation, complete56 upgrade, retained case
  and attachment rows, unchanged native provenance, transactional DDL/ledger
  rollback, rejection of runtime mismatch, and a repeated no-op.
- Frontend API contract is included in the combined 40/40 focused checks;
  web build/typecheck and scoped lint passed.

All database work used isolated local synthetic fixtures. No production case was
read or deleted. Browser confirmation/cancel/retry assertions are prepared in the
single cases workflow but remain unexecuted: the installed Chromium sandbox helper
is not root-owned. See [browser boundary](../issue-449/browser-acceptance.md).

## Release handoff

The sole coordinator must add the exact product57 upgrade/release profile before
rollout; existing `scripts/public-text-release.mjs` covers through product56.
No production deployment, migration execution or case deletion was attempted.
The column is additive, but deploying old code after user deletions would expose
retained tombstones because old readers lack the `deleted_at` predicate. Recovery
must therefore retain tombstone-aware application code; do not roll back to an
older image after accepting deletions without an explicit data-safe plan.
