# LingxiLoop Web release guide

LingxiLoop currently publishes **Web/server releases only**. Electron, macOS, Windows, Linux desktop and mobile artifacts are not part of the current release line.

## What a release does

The root `VERSION` file is the Web/server release source of truth. When a change to `VERSION` lands on `main`, `.github/workflows/release.yml`:

1. checks out that exact `main` commit;
2. reads `VERSION` and resolves `v<version>`;
3. installs dependencies with `npm ci`;
4. runs client/server type checks and builds the Vite Web bundle;
5. creates an annotated Git tag on that exact commit;
6. creates the matching GitHub Release in `LingXi-Org/LingxiLoop`.

Versions containing a suffix (for example `0.1.0-alpha`) are published as GitHub prereleases. A release does **not** deploy or mutate a running server.

The workflow is retry-safe: if the tag already exists it verifies that the tag resolves to the same release commit before continuing.

## Cut a release

Release preparation should go through a PR so the normal PR and Docker Compose E2E checks run before publication.

For the next release, update `VERSION` only after the desired product/deployment changes are ready:

```bash
printf '0.1.0-alpha\n' > VERSION
git add VERSION
git commit -m 'release: v0.1.0-alpha'
git push
```

Merge that release PR after all required checks are green. The merge itself triggers **Actions → Web Release**, which creates `v0.1.0-alpha` and the GitHub prerelease automatically.

Do not create the same tag manually at a different commit: the release workflow will intentionally fail rather than move an existing release tag.

## Deploy the Web/server release

The supported alpha topology is `docker-compose.mvp.yml`:

```text
Browser → HTTPS reverse proxy → LingxiLoop SPA/API/WS
                               ├→ Postgres
                               ├→ Redis
                               └→ LingxiGraph Runtime → model provider
```

Use one LingxiLoop API replica only in `LINGXILOOP_MANAGED_AGENT_EXECUTION=server` mode. The production host only needs Git, Docker Engine and Docker Compose v2; Node/npm are not required.

On the server:

```bash
git fetch --tags
git checkout v0.1.0-alpha
cp .env.example .env
# configure secrets/provider/public Web origin

docker compose -f docker-compose.mvp.yml up -d --build
docker compose -f docker-compose.mvp.yml ps
docker compose -f docker-compose.mvp.yml exec -T lingxiloop \
  npx tsx server/scripts/mvp-smoke.ts
```

The Compose stack binds the Web app to loopback by default. Put TLS/WebSocket termination in front of `127.0.0.1:5181`; normally only ports 80/443 should be Internet-facing. Do not expose Postgres, Redis or the LingxiGraph Runtime publicly.

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
docker compose -f docker-compose.mvp.yml exec -T lingxiloop \
  npx tsx server/scripts/mvp-smoke.ts
```

Do **not** run `docker compose down -v` during normal upgrades or rollbacks unless you intentionally want to delete persistent data.
