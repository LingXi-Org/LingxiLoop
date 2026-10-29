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

The Web app is the supported development and release surface.

## Make changes

- Follow [`AGENTS.md`](AGENTS.md) and the existing module boundary.
- Keep tenant/project authorization on the server and preserve audit, message, lease, idempotency, and LLM ledger contracts.
- Add PostgreSQL changes as the next file under `server/src/db/migrations/`. Never edit, rename, reorder, or delete an applied migration.
- Keep Open Notebook/SurrealDB schema work in its vendored lifecycle.
- Match the edited file's style. Comments should explain non-obvious constraints, not restate code.
- Use the canonical shadcn primitives and HugeIcons. Preserve keyboard access, focus, labels, reduced motion, and contrast.

## Verify

Run only the lint, typecheck, test, and build commands for the changed Web, Admin, Control, Server, or vendored Open Notebook surface. Use `test:integration -- --file <owning-test>` for focused integration coverage.

Migration changes require their migration and affected domain integration files. Agent behavior changes require the matching retained integration check. Historical E2E/Eval harnesses and experiments are available in Git history; new regressions should exercise a concrete failure through the smallest existing check. CI classifies changed paths and skips unrelated checks, images, migrations, and deployments.

Test-only changes run their owning checks, including changed files outside the default smoke list, without publishing images. PR/manual checks build Web/Admin; main builds Web in Docker and Admin before D1 migrations. CI/deployment configuration changes run deployment contract checks without rebuilding unrelated images.

Use the workflow's manual `deep-integration` scope for all retained integration checks, the Redis restart experiment, and empty-database document/canvas Worker flows. These checks do not run on PR, push, or release; this manual scope never publishes or deploys.

Open Notebook supports only the default `lingxiloop-rag` image. In `third_party/open-notebook`, run `uv run --frozen --python 3.12 pytest -q`; the default install includes RAG and development dependencies. Archived upstream application sources have no build or test entrypoint.

Report security vulnerabilities through [`SECURITY.md`](SECURITY.md), not a public issue. Keep commits and pull requests focused on one logical change.
