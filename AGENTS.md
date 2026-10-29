# LingxiLoop

This is a stable web product. Follow the user's request to completion; ask only when an answer would materially change the outcome or the next action needs new authority. Repository edits do not authorize deployment, publishing, external messages, or destructive operations.

## Development scope

Before adding complexity for a speculative or vanishingly unlikely race or security edge case, explain the concrete failure mode, likelihood, and complexity cost to the user and get their buy-in. Do not silently expand scope for theoretical robustness.

[Source and MIT attribution](THIRD_PARTY_NOTICES.md#opencode-agent-guidance).

## Delivery

1. Track the issue, work on an isolated branch, and open a draft PR. Parallel contributors preserve other branches and hand off to the parent thread's designated sole integrator; only that integrator merges the product release and serializes production rollout.
2. Run focused short regressions and independent review against the final candidate commit. Require successful CI for the exact release commit, formally published upstream dependencies, exact dependency locks, and immutable image identities before rollout. Rerun affected checks after changes; never report an unrun check as passed.
3. Follow [Operate Release Controller](.agents/skills/operate-release-controller/SKILL.md) for LingxiLoop product rollout and recovery: immutable manifests, MCP/CLI release operations, durable controller/host receipts and actual HTTPS/business probes. Verify deployed artifact identities, runtime/schema provenance, Web readiness and both Worker healthchecks; a queued request, merge or older green result is insufficient. Use [Operate Komodo Production](.agents/skills/operate-komodo-production/SKILL.md) only for retained shared stacks/Core maintenance or explicitly authorized bootstrap transport, with terminal successful Komodo receipts for those actions.
4. Diagnose failures, perform authorized reversible recovery, and verify the resulting receipt and health again. Prefer a narrow fix forward; roll back only to a known compatible release, respecting schema/lease rules and preserving durable data. Report the exact failed or pending action and evidence when recovery remains blocked.

Use the current session's authorization and designated integrator. Report completed, failed and unverified work separately. Historical release context is archived in [the maintenance evidence](https://github.com/LingXi-Org/LingxiLoop/blob/351e895a315bb46b9061c8628b20d9b9fa5ffa1e/docs/evidence/issue-370/session-20261019.md).

## Product invariants

- Keep Web/API and background workers separate. The browser web app is the supported development and release surface; Electron tooling is retired.
- PostgreSQL owns product state, WuKongIM durable IM, Redis ephemeral coordination, and vendored Open Notebook/SurrealDB its own schema.
- The old Agent OS and harness are retired. Use the exact published LingxiOS dependency through its public exports; do not restore vendored runtime code or invent a compatibility adapter. Keep product authorization and the shared LLM ledger intact.
- At every server trust boundary, enforce tenant and project authorization. Never expose or log credentials, tokens, or prompts; preserve signed callback/webhook checks.
- Keep web UI keyboard-accessible, visibly focused, semantically labelled, motion-reduced, and readable.

## Data and delivery

- `server/src/db/migrations/0001_v1_baseline.sql` is immutable. Add one next-numbered, transactional, forward-compatible migration; runtime code never executes DDL. A non-empty database without `schema_migrations` must be rebuilt by operations, never adopted by the app.
- Use the smallest owning check: web (`lint`, `typecheck`, `test`, `build`); admin/control (`admin:*`/`control:*`); server (`server:*` and affected integration); Open Notebook (its own affected package). Migration and runtime integration changes also require their owning integration coverage.
- Historical browser/Eval harnesses are retired. Add only focused checks for concrete changed behavior; use the existing CI/product/release checks where applicable.
- Verify product releases through durable controller/host receipts and actual probes; use Komodo CLI/API update state for retained shared infrastructure. Never copy credentials into files or output.

## Testing

- Choose the smallest check that exercises the changed behavior. Use E2E for multi-step product flows and retain a reproducible result.
- For isolated behavior changes, identify failure modes and write the regression before implementation.

## Maintenance

For chat, approval, recovery, artifact or learning-help UX work, start with
[assistant-ui](.agents/skills/assistant-ui/SKILL.md) and its
[learning-experience guide](.agents/skills/assistant-ui/references/learning-experience.md).
Use [better-layout](.agents/skills/better-layout/SKILL.md) for surfaces/adaptivity,
[streaming](.agents/skills/streaming/SKILL.md) for delivery/reading continuity and
[product-copy](.agents/skills/product-copy/SKILL.md) for truthful next-step wording.

For cleanup, dependency/config retirement, CI cost or development-instruction changes, load [repository-maintenance](.agents/skills/repository-maintenance/SKILL.md). Use [repository-review](.agents/skills/repository-review/SKILL.md) for independent read-only review.
