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

Canvas checkpoint: ordinary `canvas.submit_report` now exposes only ordinary report fields. `canvas.submit_verification` requires the referenced specialist report, nonempty disconfirming checks and a verdict. Both schemas reject unknown fields. Current durable assignments control grants and repeat role checks during native authorization; report transactions lock the assignment and reject cancelled or inconsistent role bindings. Existing evidence/version checks remain in the report application.

The two contract tests failed before this change. The PostgreSQL assignment regression checks both roles and stale cross-role grants, then assignment replacement/stop and principal revocation. `node e2e/server/run.mjs --file canvas-public-assignment.test.ts --file native-authorization-faults.test.ts` passed 4/4 without skips. The contract tests are included in the permanent server smoke list.

This is one checkpoint toward #159. Upstream sanitized diagnostic propagation, the remaining complete category/retry matrix, browser verification and full combined release acceptance remain pending. No real-provider, deployment, or soak claim is made.
