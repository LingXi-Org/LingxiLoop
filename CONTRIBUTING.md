# Contributing to LingxiLoop

Contributions are licensed under the project [MIT License](LICENSE).

## Setup

Use Node.js 22, Python 3 with IPython, PostgreSQL 16/pgvector, Redis 7, and a local WuKongIM v3 instance.

```bash
npm ci
npm run db:migrate
npm run dev:all
```

Configure required providers through [`.env.example`](.env.example). Required capabilities fail closed; do not add fake production fallbacks.

The Web app is the only supported release surface. Electron is local-development compatibility only: do not add publishing, update, download, CI, or desktop-specific test paths. Local Electron builds must keep `--publish never`.

## Make changes

- Follow [`AGENTS.md`](AGENTS.md) and the existing module boundary.
- Keep tenant/project authorization on the server and preserve audit, message, lease, idempotency, and LLM ledger contracts.
- Add PostgreSQL changes as the next file under `server/src/db/migrations/`. Never edit, rename, reorder, or delete an applied migration.
- Keep Open Notebook/SurrealDB schema work in its vendored lifecycle.
- Match the edited file's style. Comments should explain non-obvious constraints, not restate code.
- Use the canonical shadcn primitives and HugeIcons. Preserve keyboard access, focus, labels, reduced motion, and contrast.

## Verify

Run focused checks while iterating, then the complete affected gates:

```bash
npm run lint
npm run typecheck
npm run server:typecheck
npm run admin:typecheck
npm run build
npm run admin:build
npm test
npm run eval:check
npm run db:migrate
npm run test:integration
```

Migration changes require migration integration coverage. Agent behavior changes require deterministic Eval coverage. Browser verification is not part of repository validation or CI. CI always runs the complete matrix; there is no changed-path classifier or local selector.

Report security vulnerabilities through [`SECURITY.md`](SECURITY.md), not a public issue. Keep commits and pull requests focused on one logical change.
