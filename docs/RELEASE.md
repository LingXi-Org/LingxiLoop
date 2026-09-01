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

Before cutover:

1. Back up PostgreSQL and other durable stores.
2. Verify all four image digests and required secrets.
3. Run `npm run db:migrate`, or allow Compose `db-migrate` to complete.
4. Reconcile and read back the R2 CORS policy for the production Web origin.
5. Start Web, Worker, Agent OS, WuKongIM, and Open Notebook.
6. Verify `/api/meta`, `/api/health`, authenticated channel access, and the knowledge upload/retrieval smoke.

Rollback application images only when the previous binaries are compatible with all migrations already applied. SQL migrations are forward-only and are never removed or edited for rollback; otherwise restore the database backup paired with the previous digest set.

`PRESENTATION_HTML_ENABLED` remains off unless Open Notebook ingestion, private R2 storage, presentation validation, and the pinned renderer runtime are healthy.
