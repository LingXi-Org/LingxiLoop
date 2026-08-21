# LingxiLoop

> Human–Agent and Agent–Agent real-time collaboration, powered by LingxiGraph.

LingxiLoop ships as one cloud backend plus two supported clients: the same
React/Vite Web renderer served by the backend, and signed Windows/macOS
Electron packages. Both clients use the same cloud API and the backend-owned
LingxiGraph Runtime. The desktop package never contains or calls LingxiGraph
directly.

## Production architecture

```text
Web browser ─────────────┐
                        ├─ HTTPS / WebSocket ─ Reverse proxy ─ 127.0.0.1:5181
Electron desktop ───────┘                                  │
                                                           ▼
                                         LingxiLoop SPA + API (one instance)
                                           ├─ PostgreSQL + pgvector
                                           ├─ Redis
                                           └─ LingxiGraph Runtime ─ model provider
```

Production uses [`docker-compose.production.yml`](docker-compose.production.yml).
Only `127.0.0.1:5181` is published; PostgreSQL, Redis and LingxiGraph remain on
the private Compose network. Managed turns are in-process, so the API remains a
single instance.

The current Web origin is `https://loop.lingxilearn.cn`. It is supplied through
the GitHub `production` Environment, not committed as a desktop API fallback.
Desktop builds fail if `VITE_LINGXILOOP_API_BASE` is missing or is not a clean
HTTPS origin.

## Local development

Install Node.js 20+, PostgreSQL and Redis, then:

```bash
createdb -h localhost lingxiloop
export OPENAI_API_KEY=sk-...
npm install
npm run dev:all
```

Open `http://localhost:5180`. The default reasoning/dispatch contract is:

```env
LINGXILOOP_REASONING_RUNTIME=lingxigraph
LINGXILOOP_MANAGED_AGENT_EXECUTION=server
LINGXIGRAPH_URL=http://localhost:8124
```

[`docker-compose.mvp.yml`](docker-compose.mvp.yml) remains the build-from-source
local Compose stack. [`docker-compose.mvp.ci.yml`](docker-compose.mvp.ci.yml)
uses a deterministic model-provider stub while exercising the real Python
LingxiGraph HTTP boundary.

## CI/CD

- `LingxiLoop CI` runs the reusable quality gate on pull requests: brand and
  version guards, Biome, client/server types, unit and PostgreSQL/Redis
  integration tests, full Compose recovery E2E, and unsigned Windows/macOS
  directory-package smoke checks.
- `LingxiLoop Web deploy` runs the same gate on `main`, publishes
  `ghcr.io/lingxi-org/lingxiloop-server` and
  `ghcr.io/lingxi-org/lingxigraph-runtime`, then SSH-deploys immutable digests.
  It migrates, verifies `/api/meta`, runs a real LingxiGraph turn, performs an
  authenticated public smoke, and restores the previous digests on failure.
- `LingxiLoop Desktop release` handles an existing `v${VERSION}` tag whose
  commit belongs to `main`. It waits for the same commit to be live on Web,
  then signs Windows x64 and macOS x64/arm64, notarizes macOS, validates every
  signature and publishes the updater metadata with the installers.
- `LingxiLoop production smoke` runs daily against HTTPS, authenticated API,
  WebSocket, PostgreSQL, Redis, version metadata and LingxiGraph health.

There are no mobile publishing workflows. iOS/Android source remains branded
and buildable for future work, but it is outside the supported release line.
The BYOA daemon and Worker source remain in the repository; npm CLI, Worker and
marketing-site publication are not automated.

See [`docs/RELEASE.md`](docs/RELEASE.md) for Environment configuration and the
release procedure.

## Version and product metadata

[`VERSION`](VERSION) is the only release version source. Synchronize and check
package metadata with:

```bash
npm run version:sync
npm run version:check
```

Every server exposes `GET /api/meta`:

```json
{
  "product": "LingxiLoop",
  "version": "<VERSION>",
  "commitSha": "<git sha>",
  "reasoningRuntime": "lingxigraph"
}
```

## Repository layout

| Path | Role |
|---|---|
| `src/` | shared React/Vite Web and Electron renderer |
| `electron/` | desktop main process, bridge and updater |
| `server/` | API, WebSocket, scheduler and LingxiGraph integration |
| `server/lingxigraph/` | LingxiGraph production graph and durable Runtime manifest |
| `docker-compose.production.yml` | digest-pinned production topology |
| `agent-cli/`, `agent-fuse/` | retained BYOA tooling |
| `ios/`, `android/` | retained mobile source; not released |
| `workers/`, `website/` | retained optional source; not deployed by CI |

## Development checks

```bash
npm run guard:brand
npm run version:check
npm run lint
npm run typecheck
npm run server:typecheck
npm test
npm run test:integration
```

Additional documentation: [`CONTRIBUTING.md`](CONTRIBUTING.md),
[`SECURITY.md`](SECURITY.md), and [`docs/COORDINATION.md`](docs/COORDINATION.md).
