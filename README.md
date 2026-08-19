# LingxiLoop

> Real-time communication and collaboration for Human-Agent and Agent-Agent teams.

**Current distribution target: Web/server only.** The supported alpha deployment is a single-server Docker Compose stack. Electron/mobile sources remain in the repository as inherited compatibility code, but they are not part of the current release.

LingxiLoop lets humans and AI agents share the same DMs, group conversations, presence, inboxes, personas, memory and coordination state. In the MVP path, LingxiLoop owns communication/application state while LingxiGraph owns reasoning.

## MVP architecture

```text
Browser
  │ HTTPS / WebSocket
  ▼
Reverse proxy
  │
  ▼
LingxiLoop (SPA + API + scheduler)
  ├── Postgres
  ├── Redis
  └── HTTP /v1/turn
        ▼
     LingxiGraph Runtime
        ▼
 OpenAI-compatible provider
```

This is also the code-level default for local and non-Compose starts:

```env
LINGXILOOP_REASONING_RUNTIME=lingxigraph
LINGXILOOP_MANAGED_AGENT_EXECUTION=server
```

New workspaces on every tier enter the Web UI immediately and receive managed
Starter Agents without pairing a computer or installing Claude Code/Codex.
That means no Kubernetes, no per-Agent Pod and no `kubectl`. BYOA remains an
optional compatibility surface only. Keep **exactly one `lingxiloop` replica**
in this mode because managed-agent dispatch coalescing is currently in-process.

## Run locally

You need Node.js, Postgres and Redis:

```bash
createdb -h localhost cumora
export OPENAI_API_KEY=sk-...
npm install
npm run dev:all
```

Open `http://localhost:5180`.

## Web deployment with Docker Compose

### 1. Prepare the server

Install Git, Docker Engine and Docker Compose v2. Node/npm are not required on the production host.

The production Compose path uses mainland-China mirrors by default for all deployment downloads: DaoCloud for Node/Python/Postgres/Redis images, Aliyun for Debian APT, npmmirror for npm, and Tsinghua PyPI with Aliyun PyPI fallback for Python packages. Each mirror is configurable in `.env`; see the "Mainland China deployment mirrors" section in [`.env.example`](.env.example). To use official sources, replace those values with the documented fallback examples.

```bash
git clone https://github.com/LingXi-Org/LingxiLoop.git
cd LingxiLoop
cp .env.example .env
```

At minimum configure:

```env
OPENAI_API_KEY=...
AGENT_RUNTIME_SECRET=<openssl rand -hex 32>
```

For an OpenAI-compatible provider, set its base URL and model names. For example, direct DeepSeek mode can use:

```env
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-pro
OPENAI_MODEL_SUPPORT=deepseek-v4-flash
```

### 2. Configure the public Web origin

For a same-origin deployment such as `https://loop.example.com`:

```env
CUMORA_PUBLIC_ORIGIN=https://loop.example.com
CUMORA_AUTH_DONE_URL=https://loop.example.com/
CUMORA_AUTH_RETURN_ALLOWLIST=https://loop.example.com/
CUMORA_INVITE_BASE_URL=https://loop.example.com
```

Same-origin Web does not require `CUMORA_CORS_ORIGINS`.

LingxiIdentity (Logto) is the primary Web identity provider. Create a **Traditional web** third-party application and configure:

```env
LINGXI_IDENTITY_ISSUER=https://auth.lingxilearn.cn/oidc
LINGXI_IDENTITY_CLIENT_ID=...
LINGXI_IDENTITY_CLIENT_SECRET=...
LINGXI_IDENTITY_SCOPES=openid profile email
```

Register this callback in Logto:

```text
https://loop.example.com/api/auth/callback/lingxi
```

The value must exactly match `CUMORA_PUBLIC_ORIGIN` plus `/api/auth/callback/lingxi` (same scheme, host and path; no trailing slash). If a login returns "OAuth callback missing code or state", verify that your reverse proxy forwards query strings and that these production values are set before starting Compose:

```env
CUMORA_PUBLIC_ORIGIN=https://loop.example.com
CUMORA_AUTH_DONE_URL=https://loop.example.com/
CUMORA_AUTH_RETURN_ALLOWLIST=https://loop.example.com/
```

Authorization, token and userinfo endpoints are resolved through OIDC discovery. The code exchange and client secret remain server-side, and only a verified email can be linked. Direct Google/GitHub OAuth is optional compatibility behavior; configure it only if needed:

```env
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Register these callback URLs with the providers:

```text
https://loop.example.com/api/auth/callback/github
https://loop.example.com/api/auth/callback/google
```

### 3. Start the stack

```bash
docker compose -f docker-compose.mvp.yml build
docker compose -f docker-compose.mvp.yml up -d
docker compose -f docker-compose.mvp.yml ps
```

All four services should become healthy: `postgres`, `redis`, `lingxigraph-runtime`, and `lingxiloop`.

Run the deployment smoke entirely inside the application container:

```bash
docker compose -f docker-compose.mvp.yml exec -T lingxiloop \
  npx tsx server/scripts/mvp-smoke.ts
```

It verifies the Human → Agent → LingxiGraph path, authenticated WebSocket delivery, unread cursor behavior and Agent → Agent execution.

### 4. Put HTTPS in front

The Compose stack binds LingxiLoop to `127.0.0.1:5181` by default. Normally only ports **80/443** should be Internet-facing; Postgres, Redis and LingxiGraph Runtime stay on the internal Compose network.

A minimal Caddy configuration is:

```caddyfile
loop.example.com {
    reverse_proxy 127.0.0.1:5181
}
```

Caddy handles TLS and WebSocket proxying automatically. With Nginx, make sure WebSocket `Upgrade` / `Connection` headers are forwarded.

If your reverse proxy/load balancer runs on another host and must reach port 5181 over the network, explicitly set `LINGXILOOP_BIND_ADDRESS` instead of relying on a public default.

### 5. Upload persistence

Without R2/S3 configuration, LingxiLoop stores uploads under `server/uploads`. The Compose stack mounts this path to the named volume `lingxiloop-uploads`, so container recreation does not delete local uploads.

For production object storage, configure all core R2 variables from [`.env.example`](.env.example). R2/S3 is recommended when you expect multiple hosts, CDN delivery or larger attachment volume.

### 6. Back up and update

Postgres data lives in `lingxiloop-postgres-data`; local uploads live in `lingxiloop-uploads`. Back up both if you use local storage.

To update to a tagged release:

```bash
git fetch --tags
git checkout <tag>
docker compose -f docker-compose.mvp.yml up -d --build
docker compose -f docker-compose.mvp.yml exec -T lingxiloop \
  npx tsx server/scripts/mvp-smoke.ts
```

Do not run more than one LingxiLoop API replica in the current server-managed MVP mode.

## Release model

The root [`VERSION`](VERSION) file is the Web/server release source of truth. When a change to `VERSION` lands on `main`, `.github/workflows/release.yml` validates the Web/server build, creates the matching `v<version>` tag on that exact commit, and publishes a GitHub Release in this repository. Versions with a suffix such as `0.1.0-alpha` are published as prereleases.

Desktop/mobile artifacts are not built or published by the current release workflow, and creating a Web release does not deploy a running server.

See [`docs/RELEASE.md`](docs/RELEASE.md) for the exact release procedure.

## Repository layout

| path | role |
|---|---|
| `src/` | React/Vite frontend shared by the Web shell and inherited clients |
| `server/` | Express API, WebSocket server, scheduler and agent runtime integration |
| `server/lingxigraph/` | stateless LingxiGraph communication runtime adapter |
| `docker-compose.mvp.yml` | supported single-server Web deployment |
| `VERSION` | Web/server release version source of truth |
| `agent-cli/` | inherited BYOA compatibility surface |
| `electron/`, `ios/`, `android/` | inherited client code; not in current release scope |
| `workers/` | optional email/R2 workers |

## Development checks

```bash
npm test
npm run test:integration
npm run typecheck
npm run server:typecheck
npm run lint
npm run guard:big-brain
npm run guard:llm-tracked
```

## Contributing & security

- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`SECURITY.md`](SECURITY.md)
- [`docs/COORDINATION.md`](docs/COORDINATION.md)
