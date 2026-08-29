# LingxiLoop

LingxiLoop is a learning collaboration product with its own Agent OS. Six
specialized agents—Nova, Sage, Milo, Trace, Scout and Forge—work with learners
in direct messages, Study Rooms and Labs.

The supported product surfaces are the Web app and the Electron desktop app
for macOS, Windows, and Linux. Native iOS and Android apps are not maintained.

The runtime is implemented in this repository. It does not invoke, install or
pair with Codex, Claude, or another agent CLI. Codex Harness, Ankole and Prime
Agent are architecture references only.

## Architecture

```text
Web / Electron
  ├─ WuKongIM v3 — messages, channels, ordering, membership, threads, read state
  └─ LingxiLoop Web — HTTP, WebSocket, webhook and online control-plane requests
LingxiLoop Worker — schedulers, queue claims, retry, notification and GC
Agent OS — stateless model loop, sessions, compaction, stop/steer
  └─ isolated persistent IPython kernel per Agent OS session
       └─ typed loop SDK → approved Host Bridge actions through LingxiLoop Web
```

The model receives exactly one tool:

```ts
{ name: "ipython", arguments: { code: string } }
```

Agent OS uses the OpenAI Chat Completions API and owns conversation history
itself. There is no provider registry, billing gateway, or alternate transport.
Every chat, compaction, structured, embedding and image call enters the
append-only `llm_calls` technical ledger; run-level token fields are projections,
not the usage authority.
IPython variables survive across turns while
the kernel lives; durable state must be written to Agent Home or a typed
`loop.*` learning service. WuKongIM is the only authoritative message store.

Poll creation requires a stable client request identity. PostgreSQL stores the
tenant-scoped voting projection and its last published revision; the Worker
replays only unpublished deterministic snapshots to the same WuKongIM channel.
This reconciliation repairs the authoritative IM data plane rather than
creating a second message store or alternate delivery path.

## Local development

Requirements: Node.js 20+, Python 3 with IPython, PostgreSQL and Redis.

```powershell
npm ci
$env:DATABASE_URL = 'postgres://lingxiloop:lingxiloop@localhost:5432/lingxiloop'
$env:REDIS_URL = 'redis://localhost:6379'
$env:OPENAI_API_KEY = '...'
$env:OPENAI_BASE_URL = 'https://api.openai.com/v1'
$env:OPENAI_MODEL = 'gpt-5-mini'
$env:OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small'
$env:AGENT_OS_SERVICE_TOKEN = 'replace-with-a-long-random-secret'
$env:LINGXILOOP_INVITE_BASE_URL = 'http://localhost:5180'
$env:R2_ENDPOINT = 'https://<account-id>.r2.cloudflarestorage.com'
$env:R2_BUCKET = '<bucket>'
$env:R2_ACCESS_KEY_ID = '<access-key>'
$env:R2_SECRET_ACCESS_KEY = '<secret-key>'
$env:R2_PUBLIC_BASE = 'https://<r2-gateway-host>'
$env:R2_URL_SIGNING_SECRET = 'replace-with-a-long-random-secret'
npm run db:bootstrap
npm run dev:all
npm run agent-os:start
```

R2 is mandatory in local runtime too: there is no disk, Base64-upload,
unsigned-read, or presigned-GET product path. `db:bootstrap` only initializes
the immutable schema, while Web and Worker assert the complete R2 contract
before becoming ready.

### Local production-contract preview

The preview runs the real Web, API, Worker and Agent OS paths. Only
LingxiIdentity is replaced by a loopback-only OIDC server implementing the
same discovery, authorization-code, token and userinfo protocol used in
production. PostgreSQL, Redis, WuKongIM, R2 and email remain authoritative.

```powershell
Copy-Item .env.local.example .env.local
# Fill OPENAI_*, R2_* and email values in .env.local.
npm run dev:bootstrap
npm run dev:preview
```

Open `http://localhost:5180` and choose LingxiIdentity. The local identity
page confirms the email and display name, then returns through the normal
`/api/auth/callback/lingxi` endpoint. `.env.local` is ignored by Git.

For Resend Receiving on a local computer, run `npm run dev:email:tunnel` in
a second terminal. In the Resend development webhook, select only
`email.received` and set Endpoint to the HTTPS URL printed by cloudflared plus
`/webhooks/email/resend`. Copy that webhook's `whsec_...` value into
`RESEND_WEBHOOK_SECRET`; it is not the Resend API key.

For the packaged MVP topology, copy `.env.example` to `.env`, provide the
required secrets, and start the runtime:

```powershell
npm run mvp:up
```

Compose pulls the `mvp` GHCR packages through
`accel.way2api.fun/ghcr.io` by default—nothing is built locally—and waits for
the v1 database bootstrap to complete before starting the LingxiLoop Web,
background Worker, Agent OS and WuKongIM stack. Re-running Compose accepts the already-complete v1
schema, while an unmarked pre-v1 or partial schema is rejected and must be
dropped and recreated. API port
5181 and WuKong WebSocket port 5200 bind to `0.0.0.0` by default for local and
container networking; use TLS and override the bind addresses for public deployments.
Packaged services default to warning-level, size-rotated logs. Canvas state is
stored in Postgres and broadcast through the existing Redis/WebSocket path; no
service mounts the Docker socket or shares an Agent execution environment.

## Verification

```powershell
node .agents/skills/lingxiloop-verify-change/scripts/classify-change.mjs --path <changed-file>
npm run lint:local -- --path <changed-file>
npm run test:local -- --path <changed-file> --test <non-sibling-owning-test>
```

Pass every file written in the current task with a repeated `--path`. Completed
commits and unchanged local work are the trusted baseline; no-argument local
runners intentionally do nothing. The classifier adds a typecheck or global
guard only when this task changes that check's public or authoritative input.

CI owns full lint, types, architecture guards, unit/integration suites,
production build, Eval, Compose smoke, and packaging checks.

## Package publishing and production

CI publishes `lingxiloop-server`, `lingxiloop-agent-os`,
`lingxiloop-wukongim`, and the audited vendored `lingxiloop-open-notebook` as
GHCR packages after every successful `main` build.
Each receives immutable commit/version tags plus the rolling `mvp` tag used by
the one-command deployment.

[`docker-compose.production.yml`](docker-compose.production.yml) requires
digest-pinned server, Agent OS, WuKongIM, and Open Notebook images. WuKongIM v3 source builds
are pinned to commit `c7f663fa23a4ee2c6f7e08c68423f50f0f6e9c47`; production must deploy its
verified immutable image digest. Its management API remains private, while the
TLS client endpoint is published by the deployment proxy.

LingxiLoop v1 intentionally has no database upgrade path. For PostgreSQL not
managed by the supplied Compose files, initialize an empty database with
`npm run db:bootstrap`; existing development databases must be dropped and
recreated. Web and Worker startup never executes DDL. They run from the same
immutable server image as independently restartable/scalable services; changing
Web replica count never creates more scheduler, retry, sweeper or GC loops.

## Repository map

| Path | Purpose |
| --- | --- |
| `server/src/bin/` | Explicit Web, Worker and Agent OS process entrypoints |
| `server/src/worker.ts` | Background task registry and documented concurrency policy |
| `server/src/agent-os/` | Agent OS host, model loop, queue and Host Bridge contracts |
| `server/agent-os/` | Persistent IPython kernel runner |
| `server/src/im/` | WuKongIM bootstrap, webhook, routing and payload contracts |
| `server/src/modules/` | HTTP domain slices and their public domain facades |
| `server/src/modules/documents/` | Document HTTP/collaboration boundary and durable, lease-claimed mention delivery |
| `server/src/agents/` | Typed learning-domain services used by the Host Bridge |
| `server/src/eval/` | Backend-only deterministic Eval contracts, persistence and pipeline; V1 ships no Eval frontend |
| `eval/suites/` + `eval/baselines/` | Versioned golden Eval datasets and merge-gating baselines |
| `scripts/run-agent-eval.ts` | Frozen evaluator/harness self-test and baseline reporter |
| `scripts/run-agent-runtime-eval.ts` | Deterministic current Agent OS runtime regression gate |
| `src/lib/im/` | Browser-side WuKongIM SDK wrapper |
| `.agents/skills/lingxiloop-eval-change/` | Eval suite, baseline, trace-safety, comparison, and focused-CI workflow |
| `scripts/guard-agent-os.mjs` | CI guard for the independent runtime boundary |
| `scripts/guard-architecture.mjs` | CI guard for single-path frontend/backend boundaries |
| `scripts/guard-llm-tracked.mjs` | CI guard for the universal LLM ledger |

The Eval request contract and scoring rules are documented in [`docs/agent-eval.md`](docs/agent-eval.md).

Licensed under [MIT](LICENSE).
