# LingxiLoop

This is a stable web product. Follow the user's request to completion; ask only when an answer would materially change the outcome or the next action needs new authority. Repository edits do not authorize deployment, publishing, external messages, or destructive operations.

## Delivery

1. Track the issue, work on an isolated branch, and open a draft PR. Parallel contributors preserve other branches and hand off to the parent thread's designated sole integrator; only that integrator merges the product release and serializes production rollout.
2. Run focused short regressions and independent review against the final candidate commit. Require successful CI for the exact release commit, formally published upstream dependencies, exact dependency locks, and immutable image identities before rollout. Rerun affected checks after changes; never report an unrun check as passed.
3. Follow [Operate Komodo Production](.agents/skills/operate-komodo-production/SKILL.md) for rollout and recovery. Verify the actual deployed commit/image digests, runtime and installed schema provenance, Web readiness and both Worker healthchecks. Retain a verifiable Komodo update receipt (`Complete`, `success: true`) and relevant HTTPS checks; request acceptance or an older green result is insufficient.
4. Diagnose failures, perform authorized reversible recovery, and verify the resulting receipt and health again. Prefer a narrow fix forward; roll back only to a known compatible release, respecting schema/lease rules and preserving durable data. Report the exact failed or pending action and evidence when recovery remains blocked.

Use the current session's authorization and designated integrator. Report completed, failed and unverified work separately. Historical release context is archived in [the maintenance evidence](docs/evidence/issue-370/session-20261019.md).

## Product invariants

- Keep Web/API and background workers separate. The browser web app is the supported release surface; Electron is local development only (`electron:dev/start`), with no installer packaging or publishing.
- PostgreSQL owns product state, WuKongIM durable IM, Redis ephemeral coordination, and vendored Open Notebook/SurrealDB its own schema.
- The old Agent OS and harness are retired. Use the exact published LingxiOS dependency through its public exports; do not restore vendored runtime code or invent a compatibility adapter. Keep product authorization and the shared LLM ledger intact.
- At every server trust boundary, enforce tenant and project authorization. Never expose or log credentials, tokens, or prompts; preserve signed callback/webhook checks.
- Keep web UI keyboard-accessible, visibly focused, semantically labelled, motion-reduced, and readable.

## Data and delivery

- `server/src/db/migrations/0001_v1_baseline.sql` is immutable. Add one next-numbered, transactional, forward-compatible migration; runtime code never executes DDL. A non-empty database without `schema_migrations` must be rebuilt by operations, never adopted by the app.
- Use the smallest owning check: web (`lint`, `typecheck`, `test`, `build`); admin/control (`admin:*`/`control:*`); server (`server:*` and affected integration); Open Notebook (its own affected package). Migration and runtime integration changes also require their owning integration coverage.
- Browser verification uses `tester-army/e2e` and its official `@e2e-dev/web` engine. Do not import or run Playwright directly.
- Use Komodo's CLI/API update state for production deployment verification; never copy credentials into files or output.

## Testing

- Choose the smallest check that exercises the changed behavior. Use E2E for multi-step product flows and retain a reproducible result.
- For isolated behavior changes, identify failure modes and write the regression before implementation.

## Maintenance

For cleanup, dependency/config retirement, CI cost or development-instruction changes, load [repository-maintenance](.agents/skills/repository-maintenance/SKILL.md). Use [repository-review](.agents/skills/repository-review/SKILL.md) for independent read-only review.
