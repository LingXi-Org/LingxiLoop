# LingxiLoop

LingxiLoop is a Web learning-collaboration product with an independent Agent OS. Nova, Sage, Milo, Trace, Scout, and Forge work with learners in direct messages, Study Rooms, and Labs.

The browser Web app is the only supported release surface. Electron remains available only for local development; it is never published, auto-updated, offered for download, or tested in CI.

## Architecture

```text
Browser Web ──> LingxiLoop Web/API ──> PostgreSQL / Redis / WuKongIM / Open Notebook
                         │
LingxiLoop Worker ───────┘
                         │ authenticated Host Bridge
Independent Agent OS ────┘
  └─ isolated persistent IPython kernel per session
```

- WuKongIM is the authoritative durable message store.
- PostgreSQL stores product state, Agent work, audit, and the append-only LLM ledger.
- Redis carries ephemeral coordination.
- Agent OS exposes exactly one model tool: `{ name: "ipython", arguments: { code: string } }`. Product effects use the authenticated Host Bridge.
- Vendored Open Notebook/SurrealDB owns its independent knowledge schema lifecycle.
- Web and Worker use the same server image but are independently scalable processes; Web never starts background jobs.

## Local development

Requirements: Node.js 22, Python 3 with IPython, PostgreSQL 16 with pgvector, and Redis 7.

```powershell
npm ci
Copy-Item .env.local.example .env.local
# Fill the required database, Redis, OpenAI, WuKongIM, identity, and R2 values.
npm run dev:migrate
npm run dev:preview
```

Open `http://localhost:5180`. For direct process development, run `npm run dev:all` and `npm run agent-os:start`. Electron can be run locally with `npm run electron:dev`; every package command is fixed to `--publish never`.

PostgreSQL starts from [`0001_v1_baseline.sql`](server/src/db/migrations/0001_v1_baseline.sql) and evolves only through new numbered migrations. `npm run db:migrate` takes an advisory lock, verifies recorded names and checksums, and applies each pending file in its own transaction. It refuses a non-empty database without migration history; operations must rebuild such a legacy environment as an empty database. Web and Worker only verify that migrations are current.

For the packaged service topology:

```powershell
Copy-Item .env.example .env
# Fill required product and secret values; image tags are managed by CI.
npm run mvp:up
```

Compose runs the one-shot `db-migrate` service before Web and Worker.

## Verification

```powershell
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

CI runs the same three gates for every pull request and `main`: quality/builds, unit plus deterministic Eval, and PostgreSQL/Redis integration. CI does not install or run a browser. A successful `main` publishes server, Agent OS, WuKongIM, and Open Notebook images to `ghcr.io/<repository-owner-lowercase>/` with immutable commit-SHA and rolling `mvp` tags.

Production deployment and migration requirements are in [`docs/RELEASE.md`](docs/RELEASE.md). The current domain model is in [`docs/DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md), and Agent Eval is documented in [`docs/agent-eval.md`](docs/agent-eval.md).

Licensed under [MIT](LICENSE).
