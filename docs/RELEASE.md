# LingxiLoop Web and Desktop release guide

## GitHub `production` Environment

Configure these Environment variables:

| Variable | Example |
|---|---|
| `LINGXILOOP_PUBLIC_ORIGIN` | `https://loop.lingxilearn.cn` |
| `PRODUCTION_SSH_PORT` | `22` |
| `PRODUCTION_DEPLOY_PATH` | `/opt/lingxiloop` |

Configure these Environment secrets:

- `PRODUCTION_SSH_HOST`, `PRODUCTION_SSH_USER`,
  `PRODUCTION_SSH_PRIVATE_KEY`, `PRODUCTION_SSH_KNOWN_HOSTS`
- `GHCR_USERNAME`, `GHCR_TOKEN`
- `LINGXILOOP_SMOKE_TOKEN`, `LINGXILOOP_SMOKE_COMPANY_ID`

Use Environment protection rules if production deployment or signing requires
manual approval. The production concurrency group never cancels an active
deployment.

## Production host

Create `/opt/lingxiloop/.env.secrets` before the first deployment. CI never
writes this file. It must at least define the database credentials/URL, runtime
secrets, LingxiGraph token, and model-provider credentials:

```env
POSTGRES_USER=lingxiloop
POSTGRES_PASSWORD=<secret>
POSTGRES_DB=lingxiloop
DATABASE_URL=postgres://lingxiloop:<url-encoded-secret>@postgres:5432/lingxiloop
AGENT_RUNTIME_SECRET=<secret>
OPENAI_API_KEY=<secret>
OPENAI_BASE_URL=<optional-provider-origin>
LINGXIGRAPH_TOKEN=<secret>
```

OAuth, object storage and email credentials also belong in this host-owned
file. Public/release-specific values are supplied separately by CI. The
resulting production contract is:

```env
LINGXILOOP_REASONING_RUNTIME=lingxigraph
LINGXILOOP_MANAGED_AGENT_EXECUTION=server
LINGXIGRAPH_URL=http://lingxigraph-runtime:8124
LINGXILOOP_PUBLIC_ORIGIN=https://loop.lingxilearn.cn
LINGXILOOP_CORS_ORIGINS=app://lingxiloop
LINGXILOOP_AUTH_RETURN_ALLOWLIST=https://loop.lingxilearn.cn/,http://127.0.0.1:47823/auth/done,lingxiloop://auth
```

Point the existing reverse proxy at `127.0.0.1:5181` and forward WebSocket
upgrade headers. Do not expose the other Compose services.

## Web deployment

Every `main` push runs the full reusable quality gate. A successful run builds
and pushes both GHCR images, records their immutable digests in
`.release.next.env`, uploads the production Compose contract, and runs
`scripts/deploy-production.sh` remotely.

The deploy script:

1. rejects mutable image tags;
2. saves the active digest set;
3. pulls the new images and runs forward-compatible migrations;
4. starts one API instance without deleting volumes;
5. verifies health and `/api/meta`;
6. runs a real Human → Agent → LingxiGraph turn and cleans its fixture;
7. lets CI run authenticated public API/WebSocket checks.

Any failure restores the previous image digests and re-verifies them. Database,
Redis and upload volumes are preserved; normal deployment never runs
`docker compose down -v`.

## Desktop release

1. Update `VERSION`, then run `npm run version:sync` and commit all synchronized
   package and lockfile changes to `main`.
2. Wait for that commit's Web deployment to pass.
3. Create and push the exact tag `v${VERSION}` on that commit.

The desktop workflow rejects a mismatched tag or a commit outside `main`. It
waits until production `/api/meta` reports the tag commit and LingxiGraph,
injects `VITE_LINGXILOOP_API_BASE` from the Environment, then builds:

- Windows x64 NSIS distributed unsigned;
- macOS x64 and arm64 DMG + ZIP with ad-hoc codesign validation.

The Electron allow-list contains only the renderer, Electron main/preload,
icons and package metadata. A package verifier rejects server, LingxiGraph,
environment, private-key and secret-like files. A GitHub Release is created
only after both platforms pass. Versions containing `-` are prereleases.

Published updater assets include installers, blockmaps, `latest.yml` and
`latest-mac.yml`.
