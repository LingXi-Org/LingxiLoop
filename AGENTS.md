# LingxiLoop

This is a stable web product. Follow the user's request to completion; ask only when an answer would materially change the outcome or the next action needs new authority. Repository edits do not authorize deployment, publishing, external messages, or destructive operations.

## Authorized delivery for this session (2026-10-19)

The user authorized completing and releasing #196/#197, including the normal merge and publication of [LingxiOS PR #30](https://github.com/LingXi-Org/LingxiOS/pull/30) as runtime 3.5.4. This also covers optimization or slimming PRs explicitly assigned to this release by the parent thread. This is session-specific authority, not standing approval for future work; do not ask again for already authorized routine steps.

1. Track the issue, work on an isolated branch, and open a draft PR. Parallel contributors preserve other branches and hand off to the parent thread's designated sole integrator; only that integrator merges the product release and serializes production rollout.
2. Run focused short regressions and independent review against the final candidate commit. Require successful CI for the exact release commit, formally published upstream dependencies, exact dependency locks, and immutable image identities before rollout. Rerun affected checks after changes; never report an unrun check as passed.
3. Follow [Operate Komodo Production](.agents/skills/operate-komodo-production/SKILL.md) for rollout and recovery. Verify the actual deployed commit/image digests, runtime and installed schema provenance, Web readiness and both Worker healthchecks. Retain a verifiable Komodo update receipt (`Complete`, `success: true`) and relevant HTTPS checks; request acceptance or an older green result is insufficient.
4. Diagnose failures, perform authorized reversible recovery, and verify the resulting receipt and health again. Prefer a narrow fix forward; roll back only to a known compatible release, respecting schema/lease rules and preserving durable data. Report the exact failed or pending action and evidence when recovery remains blocked.

A long soak is not a mandatory gate for this release. Leave the paused, fixed 3.5.3 soak untouched, and label incomplete observation honestly. This workflow does not authorize credential or security-configuration changes, production data modification, or weakened authorization/isolation. Handle ordinary reversible failures autonomously; a real permission denial must be reported and must not be bypassed.

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

- Never write unit tests after you write code.
- Highly prefer E2E tests as the sole testing mechanism. Use them to verify complex features work. At the end of E2E tests, produce a verifiable and repeatable artifact.
- If you must test a system in isolation, first write down all the ways it could fail, then write the code.
