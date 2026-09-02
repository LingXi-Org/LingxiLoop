# LingxiLoop repository rules

LingxiLoop is a stable Web product. Preserve the current architecture unless the task explicitly changes it.

## Supported surface

- The browser Web app is the only supported release surface.
- Electron is local-development compatibility only. Never add desktop publishing, auto-update, download entry points, CI runners, packaging tests, or desktop-specific product tests.
- Every local Electron package command must pass `--publish never`.

## Architecture

- Keep Web/API and background worker entry points separate. Web processes must not start scheduled or queue workers.
- Agent OS remains an independently deployable runtime. Its only model-visible tool is `ipython`; product effects cross the authenticated Host Bridge.
- PostgreSQL owns product state, WuKongIM owns durable IM messages, Redis carries ephemeral coordination, and vendored Open Notebook/SurrealDB owns its independent knowledge schema.
- All LLM calls use the shared server client and ledger. Preserve lease, retry, idempotency, message, and audit contracts.
- Enforce tenant and project authorization server-side. Never trust client identifiers, expose secrets, log tokens, or weaken signed callback/webhook verification.
- Preserve keyboard operation, visible focus, semantic labels, reduced-motion behavior, and readable contrast for Web UI changes.

## PostgreSQL evolution

- `server/src/db/migrations/0001_v1_baseline.sql` is immutable. Add one strictly increasing, descriptively named SQL migration for every schema change.
- Never edit, rename, reorder, or delete an applied migration. Prefer forward-compatible expand/backfill/contract changes; migrations must be safe in their own transaction.
- Runtime processes only call migration readiness checks and never execute DDL. Deployment runs `npm run db:migrate` before Web/Worker startup.
- A non-empty database without `schema_migrations` is unsupported and must be rebuilt as an empty database by operations. Code must never auto-adopt or auto-delete it.
- Open Notebook/SurrealDB keeps its separate vendored schema lifecycle.

## Verification

Run only the checks owned by the changed surface; never run repository-wide type checks, tests, builds, or deployment packaging:

- Web: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- Admin/Control: the matching `admin:*` or `control:*` commands only.
- Server: `npm run server:lint`, `npm run server:typecheck`, `npm run server:test`, plus only the owning integration files.
- Agent Eval: run only `eval:harness` or `eval:runtime` for the changed suite.
- Vendored Open Notebook: run commands from its directory and only for its affected backend or frontend.

Database migrations require the migration integration case and affected domain cases. Agent runtime changes require only their deterministic Eval suite and owning integration cases.

Playwright and browser-automation checks are forbidden in skills and tests. Do not add Playwright dependencies, configuration, snapshots, or test artifacts.
