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

Run only the lint, typecheck, test, and build commands for the changed Web, Admin, Control, Server, or vendored Open Notebook surface. Use `test:integration -- --file <owning-test>` for focused integration coverage and `eval:check` for the independent Eval package.

Migration changes require their migration and affected domain integration files. Agent behavior changes require the matching deterministic Eval gate. Browser verification is not part of repository validation or CI. CI classifies changed paths and skips unrelated checks, images, migrations, and deployments.

Report security vulnerabilities through [`SECURITY.md`](SECURITY.md), not a public issue. Keep commits and pull requests focused on one logical change.
