# Native authorization failure classification

The shared permission resolver used to turn SQL/implementation exceptions into `DENY_BY_DEFAULT`, then native preflight labelled every error carrying `reason` as `forbidden`. `assertCan` now preserves dependency failure through a safe `PermissionResolutionError`; `can` still fails closed, with no raw error or principal log. Native preflight maps only an actual `ForbiddenError` to a terminal denial. No failure permits execution.

Frozen published runtime: `@lyyzka/lingxios@3.4.7`; no dependency, lock or migration changes in this checkpoint.

Failure cases written before implementation: SQL timeout and connection reset; TypeError; arbitrary reason-bearing errors; original-principal revocation; actual policy denials and existing cross-tenant/project isolation; no tool effects after failed authorization. The new three-case integration failed before the fix and passed after it.

Validation:

- `npm run server:typecheck`: passed.
- `npm run server:lint`: passed.
- `npm run server:test`: 102 passed, no failures/skips.
- `node e2e/server/run.mjs --file native-authorization-faults.test.ts --file permission-resolver.test.ts --file runtime-tool-recovery.test.ts`: 9 passed, no failures/skips, including real PostgreSQL `statement_timeout` (`57014`), revoked principal, and existing bounded tool correction.

Local raw logs: `/tmp/product-159-red.log`, `/tmp/product-159-fixed.log`, `/tmp/product-159-server.log`.

This is one checkpoint toward #159. Upstream sanitized diagnostic propagation, complete category/retry matrix, Canvas role-specific contracts, browser verification and full combined release acceptance remain separate pending work. No real-provider, deployment, or soak claim is made.
