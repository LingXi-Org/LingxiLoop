# Release and rollback

LingxiLoop releases only Linux service images. Desktop artifacts, auto-update metadata, installers, and desktop downloads are never produced.

## Images

A successful `main` CI run publishes these packages to the lowercase current repository owner in GHCR:

- `lingxiloop-server`
- `lingxiloop-agent-os`
- `lingxiloop-wukongim`
- `lingxiloop-open-notebook`

Each receives `:<commit-sha>` and `:mvp`; ordinary `main` runs do not overwrite a semantic-version tag. Forks publish into their own namespace. Set `GHCR_NAMESPACE` when using Compose from a fork; the default is `lingxi-org`.

Production uses digest-pinned `LINGXILOOP_SERVER_IMAGE`, `AGENT_OS_IMAGE`, `WUKONGIM_IMAGE`, and `OPEN_NOTEBOOK_IMAGE`. Operators provide `.env.secrets`; automation must not generate or overwrite it.

## PostgreSQL migrations

`server/src/db/migrations/0001_v1_baseline.sql` is the immutable v1 baseline. Every later schema change is a new, strictly increasing SQL file.

The one-shot `db-migrate` service runs before Web and Worker. It acquires a PostgreSQL advisory lock, verifies every recorded filename and SHA-256 checksum, and applies each pending migration in its own transaction. A failed migration rolls back and is not recorded. Web and Worker refuse startup when the database is behind or history has drifted; they never execute DDL.

A legacy non-empty v1 database without `schema_migrations` cannot be adopted. Operations must provision or rebuild an empty PostgreSQL database and then run `npm run db:migrate`. The migration tool never marks an existing schema as applied and never deletes data.

Open Notebook/SurrealDB retains its separate vendored schema lifecycle.

## Deployment

Every successful push to `main` now deploys both release surfaces after quality, unit/eval, and integration gates pass. Browser tests are intentionally not part of this workflow.

- Shanghai production is updated over SSH from digest-pinned GHCR images. The current one-host profile limits Agent OS to 2 concurrent runs and Open Notebook to 1 worker task.
- Refine admin is built with `VITE_LINGXILOOP_API_BASE` and published to the `lingxiloop-admin` Cloudflare Pages project with Wrangler.

Configure these GitHub `production` environment variables before the first push:

| Variable | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_PAGES_PROJECT` | `lingxiloop-admin` |
| `LINGXILOOP_PUBLIC_ORIGIN` | Public Shanghai Web/API origin, without a trailing slash |
| `LINGXILOOP_ADMIN_ORIGIN` | Refine Pages/custom-domain origin, without a trailing slash |
| `WUKONG_WS_PUBLIC_URL` | Public `wss://` WuKongIM endpoint |
| `PRODUCTION_SSH_HOST` | Shanghai host or IP |
| `PRODUCTION_SSH_PORT` | SSH port, normally `22` |
| `PRODUCTION_SSH_USER` | Restricted deployment user |
| `PRODUCTION_DEPLOY_PATH` | Absolute path, normally `/opt/lingxiloop` |

Configure `CLOUDFLARE_API_TOKEN`, `PRODUCTION_SSH_PRIVATE_KEY`, and `PRODUCTION_SSH_KNOWN_HOSTS` as GitHub environment secrets in `production`. The Cloudflare token only needs Pages edit access for this account. `PRODUCTION_SSH_KNOWN_HOSTS` must be the verified host-key line, not the result of an unverified scan performed in CI.

On the Shanghai host, install Docker with the Compose plugin, authenticate Docker to `ghcr.io`, create the deployment path, and place a mode-`600` `.env.secrets` there. CI deliberately never reads or overwrites this file. It must contain the PostgreSQL, WuKongIM, Agent OS, model, Open Notebook, R2, invite, and optional LingxiIdentity values used by `docker-compose.production.yml`.

Before cutover:

1. Back up PostgreSQL and other durable stores.
2. Verify all four image digests and required secrets.
3. Run `npm run db:migrate`, or allow Compose `db-migrate` to complete.
4. Reconcile and read back the R2 CORS policy for the production Web origin.
5. Start Web, Worker, Agent OS, WuKongIM, and Open Notebook.
6. Verify `/api/meta`, `/api/health`, authenticated channel access, and the knowledge upload/retrieval smoke.

Rollback application images only when the previous binaries are compatible with all migrations already applied. SQL migrations are forward-only and are never removed or edited for rollback; otherwise restore the database backup paired with the previous digest set.

`PRESENTATION_HTML_ENABLED` remains off unless Open Notebook ingestion, private R2 storage, presentation validation, and the pinned renderer runtime are healthy.
