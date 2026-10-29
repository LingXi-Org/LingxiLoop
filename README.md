# LingxiLoop

灵犀学习协作平台，将私聊、Study Rooms 和 Labs 集成到浏览器工作台中，并通过 LingxiOS 执行持久化 Agent 任务。

Part of [LingXi · 灵犀](https://github.com/LingXi-Org). The organization repository is [LingXi-Org/LingxiLoop](https://github.com/LingXi-Org/LingxiLoop).

- [LingxiOS](https://github.com/LingXi-Org/LingxiOS): the independent agent execution runtime consumed through its published package.
- [LingxiLit](https://github.com/LingXi-Org/LingxiLit): the organization's OpenLIT-based AI observability project.

LingxiLoop uses the exact published `@lyyzka/lingxios` version in the root/server manifests and lockfiles. The Web process owns authenticated ingress and control operations; the Worker is the only process that claims LingxiOS work.

LingxiLoop is a Web learning-collaboration product with direct messages, Study Rooms, and Labs.

The browser Web app is the supported development and release surface.

## Architecture

```text
Browser Web ──> LingxiLoop Web/API ──> PostgreSQL / Redis / WuKongIM / Open Notebook
                         │
LingxiLoop Worker ───────┘
```

- WuKongIM is the authoritative durable message store.
- PostgreSQL stores product state, audit, and the append-only LLM ledger.
- Redis carries ephemeral coordination.
- Vendored Open Notebook/SurrealDB owns its independent knowledge schema lifecycle.
- Web and Worker use the same server image but are independently scalable processes; Web never starts background jobs.

## Local development

Requirements: Node.js 22, PostgreSQL 16 with pgvector, and Redis 7.

The scoped LingxiOS package uses GitHub Packages. Root and server npm configuration read `NODE_AUTH_TOKEN` from the process environment; supply a GitHub token with `read:packages` through your local secret manager. CI uses `LINGXIOS_PACKAGES_TOKEN` when configured, otherwise `GITHUB_TOKEN` (the package must grant this repository Actions access). Docker builds accept `--secret id=npm_token,env=NODE_AUTH_TOKEN`; never pass the token as a build argument or commit its value.

Web serves the official control plane on `LINGXIOS_CONTROL_HOST:LINGXIOS_CONTROL_PORT` (loopback port 5182 by default). Workers connect through `LINGXIOS_CONTROL_URL` using the same random `LINGXIOS_SERVICE_TOKEN` of at least 32 characters. Keep this listener on the private service network. Production shares SSE previews through a dedicated nonpersistent `LINGXIOS_REALTIME_REDIS_URL`; PostgreSQL remains authoritative when previews are unavailable.

Production requires a separate private `LINGXIOS_R2_BUCKET` and bucket-scoped `LINGXIOS_R2_ACCESS_KEY_ID` / `LINGXIOS_R2_SECRET_ACCESS_KEY`, using the existing `R2_ENDPOINT`. Artifacts and per-Python-cell workspace checkpoints use S3 reads with size/hash verification. Checkpoints restore files and directories, not interpreter memory. Before upgrading, stop admission and drain workers, back up the database and old homes, explicitly migrate the schema and import any existing files with the published SDK's `migrateLocalRuntimeFiles`; missing source files must block cutover. Keep backups until both workers and cross-node streams have been verified.

The default chat and Agent model is SiliconFlow `deepseek-ai/DeepSeek-V4.1-Flash`; new vector retrieval calls use `Pro/BAAI/bge-m3` (1024 dimensions). Independent rerankers keep their own model. Existing embedding indexes must be migrated under their stored model contract before changing the running knowledge configuration; matching dimensions alone does not make vectors interchangeable.

The [official CN tariff](https://www.siliconflow.cn/pricing), checked 2026-10-22, prices Pro BGE input at **CNY 0.000070 per 1,000 tokens**, equivalent to **CNY 0.07 per million**. DeepSeek-V4.1-Flash standard input/cache/output is CNY 2/0.04/8 per million, with CNY 1/0.02/4 during 02:00–08:00 Beijing time. Product calls record their request-time tariff; admission and native observations without an exact request timestamp use a conservative standard-price estimate. `SILICONFLOW_USD_CNY_RATE` explicitly converts CNY estimates into the USD ledger (development default 7; required in production). Measured tokens, currency, tariff and conversion are retained; existing records keep their actual historical model and price. Provider invoices remain authoritative.

```powershell
npm ci
Copy-Item .env.local.example .env.local
# Fill the required database, Redis, OpenAI, WuKongIM, identity, and R2 values.
npm run dev:migrate
npm run dev:preview
```

Open `http://localhost:5180`. For direct process development, run `npm run dev:all`.

PostgreSQL starts from [`0001_v1_baseline.sql`](server/src/db/migrations/0001_v1_baseline.sql) and evolves only through new numbered migrations. `npm run db:migrate` takes an advisory lock and verifies names and checksums. The native runtime cutover is atomic: migration `0010_lingxios_native_runtime.sql` rejects any old runtime data, removes the retired schema, installs the exact package schema, and records its version and SHA-256 manifest. Application startup only checks migration and package readiness; Web and Worker never execute DDL.

For the packaged service topology:

```powershell
Copy-Item .env.example .env
# Fill required product and secret values; image tags are managed by CI.
npm run mvp:up
```

Compose runs the one-shot `db-migrate` service before Web and Worker.

## Verification

Run only the commands for the changed surface: Web uses the unprefixed lint/typecheck/test/build commands; Admin, Control, and Server use their matching prefixes; integration accepts owning files through `npm run test:integration -- --file <test-name>`.

The checkout retains CI-selected product regressions, migration checks and release contracts. Historical browser fixtures, independent Eval, performance experiments and Electron tooling were retired; their sources remain in Git history. See [the cleanup record](docs/maintenance-551.md) for scope and measurements.

CI classifies changed paths, runs only their checks, and publishes only affected images to `ghcr.io/<repository-owner-lowercase>/` with immutable commit-SHA tags. CI does not install or run a browser.

Production deploys on every merge to `main`, or from any clone with Sigillo access via `npm run deploy` (`-- plan` / `-- status` are read-only); see [`docs/RELEASE.md`](docs/RELEASE.md) for the flow, hosts and migration rules. The current domain model is in [`docs/DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md).

Licensed under [MIT](LICENSE).
