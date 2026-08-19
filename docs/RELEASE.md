# LingxiLoop Web release guide

LingxiLoop currently publishes **Web/server releases only**. Electron, macOS, Windows, Linux desktop and mobile artifacts are not part of the current release line.

## What a release does

A tag matching `v*` triggers `.github/workflows/release.yml`.

The workflow:

1. checks out the tagged source;
2. installs dependencies with `npm ci`;
3. runs client and server type checks;
4. builds the Vite Web bundle;
5. creates a GitHub Release in `LingXi-Org/LingxiLoop`.

Tags containing a suffix (for example `v0.1.0-alpha`) are marked as GitHub prereleases. A release tag does **not** deploy or mutate a running server.

## Cut a release

First make sure the intended release commit is on `main` and its PR/Compose checks are green. Then create an annotated tag on that exact commit:

```bash
git switch main
git pull --ff-only

git tag -a v0.1.0-alpha -m "LingxiLoop v0.1.0-alpha"
git push origin v0.1.0-alpha
```

Watch **Actions → Web Release**. After it succeeds, the GitHub Release is available from this repository's Releases page.

## Deploy the Web/server release

The supported alpha topology is `docker-compose.mvp.yml`:

```text
Browser → HTTPS reverse proxy → LingxiLoop SPA/API/WS
                               ├→ Postgres
                               ├→ Redis
                               └→ LingxiGraph Runtime → model provider
```

Use one LingxiLoop API replica only in `LINGXILOOP_MANAGED_AGENT_EXECUTION=server` mode.

On the server:

```bash
git fetch --tags
git checkout v0.1.0-alpha
cp .env.example .env
# configure secrets/provider/public Web origin

docker compose -f docker-compose.mvp.yml up -d --build
docker compose -f docker-compose.mvp.yml ps
npm run mvp:smoke
```

Put TLS/WebSocket termination in front of port `5181`. Do not expose Postgres, Redis or the LingxiGraph Runtime publicly.

## Persistent data

The Compose stack persists:

- PostgreSQL: `lingxiloop-postgres-data`
- local uploads: `lingxiloop-uploads`

For object storage, configure the R2/S3 variables in `.env.example`; this is recommended for larger production deployments.

## Rollback

Checkout the previous known-good tag/commit and rebuild the application containers. Keep the Postgres and upload volumes intact:

```bash
git checkout <previous-tag>
docker compose -f docker-compose.mvp.yml up -d --build
npm run mvp:smoke
```

Do **not** run `docker compose down -v` during normal upgrades or rollbacks unless you intentionally want to delete persistent data.
