# LingxiLoop

LingxiLoop is a learning collaboration product with its own Agent OS. Six
specialized agents—Nova, Sage, Milo, Trace, Scout and Forge—work with learners
in direct messages, Study Rooms and Labs.

The runtime is implemented in this repository. It does not invoke, install or
pair with Codex, Claude, or another agent CLI. Codex Harness, Ankole and Prime
Agent are architecture references only.

## Architecture

```text
Web / Electron
  ├─ WuKongIM v3 — messages, channels, ordering, membership, threads, read state
  └─ LingxiLoop control plane — identity, learning assets, approvals, work queue
       └─ Agent OS — stateless model loop, sessions, compaction, stop/steer
            └─ isolated persistent IPython kernel per Agent OS session
                 └─ typed loop SDK → approved Host Bridge actions
```

The model receives exactly one tool:

```ts
{ name: "ipython", arguments: { code: string } }
```

Agent OS uses DeepSeek's OpenAI-compatible Chat Completions protocol and owns
conversation history itself. `DEEPSEEK_BASE_URL` may point to an approved
DeepSeek gateway, but there is no alternate provider registry. IPython variables survive across turns while
the kernel lives; durable state must be written to Agent Home or a typed
`loop.*` learning service. WuKongIM is the only authoritative message store.

## Local development

Requirements: Node.js 20+, Python 3 with IPython, PostgreSQL and Redis.

```powershell
npm ci
$env:DATABASE_URL = 'postgres://lingxiloop:lingxiloop@localhost:5432/lingxiloop'
$env:REDIS_URL = 'redis://localhost:6379'
$env:DEEPSEEK_API_KEY = '...'
$env:DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'
$env:DEEPSEEK_MODEL = 'deepseek-chat'
$env:AGENT_OS_SERVICE_TOKEN = 'replace-with-a-long-random-secret'
npm run migrate
npm run dev:all
npm run agent-os:start
```

For the packaged MVP topology, copy `.env.example` to `.env`, provide the
required secrets, then run exactly one deployment command:

```powershell
npm run mvp:up
```

Compose pulls the `mvp` GHCR packages through
`accel.way2api.fun/ghcr.io` by default—nothing is built locally—and waits for
the LingxiLoop API, Agent OS and WuKongIM stack to become healthy. API port
5181 and WuKong WebSocket port 5200 bind to `0.0.0.0` by default for mobile
clients; use TLS and override the bind addresses for public deployments.
Packaged services default to warning-level, size-rotated logs. Canvas state is
stored in Postgres and broadcast through the existing Redis/WebSocket path; no
service mounts the Docker socket or shares an Agent execution environment.

## Verification

```powershell
npm run guard:agent-os
npm run server:typecheck
npm run typecheck
npm test
```

The architecture guard rejects retired runtime files, executable Codex/Claude
adapters, BYOA pairing configuration, LingxiGraph runtime dependencies and any
model tool surface other than `ipython`.

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

Cutover is intentionally one-way. The migration removes BYOA agents and their
owned data, resets legacy chat/runtime data, preserves human-owned learning
assets, removes Shared Computer state, and provisions fresh Study Room and Lab bindings.
Rollback restores the pre-cutover PostgreSQL and WuKongIM volume backups; it
does not reactivate the retired runtime.

## Repository map

| Path | Purpose |
| --- | --- |
| `server/src/agent-os/` | Agent OS host, model loop, queue and Host Bridge contracts |
| `server/agent-os/` | Persistent IPython kernel runner |
| `server/src/im/` | WuKongIM bootstrap, webhook, routing and payload contracts |
| `server/src/agents/` | Typed learning-domain services used by the Host Bridge |
| `server/src/eval/` | Deterministic answer, RAG, tool, and multi-Agent evaluation pipeline |
| `eval/suites/` + `eval/baselines/` | Versioned golden Eval datasets and merge-gating baselines |
| `scripts/run-agent-eval.ts` | Frozen evaluator/harness self-test and baseline reporter |
| `scripts/run-agent-runtime-eval.ts` | Deterministic current Agent OS runtime regression gate |
| `src/lib/im/` | Browser-side WuKongIM SDK wrapper |
| `src/admin/EvalPage.tsx` | Eval run pipeline, failure drill-down, and version comparison dashboard |
| `.agents/skills/lingxiloop-eval-change/` | Eval suite, baseline, trace-safety, comparison, and focused-CI workflow |
| `scripts/guard-agent-os.mjs` | CI guard for the independent runtime boundary |

The Eval request contract and scoring rules are documented in [`docs/agent-eval.md`](docs/agent-eval.md).

Licensed under [MIT](LICENSE).
