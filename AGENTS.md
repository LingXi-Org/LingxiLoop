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

Run the smallest relevant checks while developing, then the complete affected gates before handoff:

```sh
npm run lint
npm run typecheck
npm run server:typecheck
npm run admin:typecheck
npm run build
npm run admin:build
npm test
npm run eval:check
npm run db:migrate && npm run test:integration
```

Database migrations also require the migration integration cases. Agent runtime changes require deterministic Eval coverage.

## Production handoff

- Before every final response, follow `.codex/hooks.json`. If the turn changed live production, update the applicable `operate-openship-production` references without recording secrets, then validate that skill.
- OpenShip MCP authentication is supplied by the configured MCP transport. Never read, print, or copy its PAT into repository files or skills; validate access with a harmless MCP health call.
