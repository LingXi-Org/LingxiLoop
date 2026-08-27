# Release and rollback

Production deploys four immutable application images:

- `LINGXILOOP_SERVER_IMAGE`
- `AGENT_OS_IMAGE`
- `WUKONGIM_IMAGE`
- `OPEN_NOTEBOOK_IMAGE`

All must use `image@sha256:…`. No application service mounts the Docker socket;
Canvas collaboration is ordinary Postgres state fanned out through the existing
Redis/WebSocket path. WuKongIM v3 is built from verified commit
`c7f663fa23a4ee2c6f7e08c68423f50f0f6e9c47` and then pinned by image digest.
Operators provide `.env.secrets`; CI uploads only `.release.next.env`, Compose
and deployment scripts.

LingxiLoop v1 requires an empty PostgreSQL database. The release has no schema
upgrade, compatibility ALTER, or data backfill path: discard pre-v1 development
databases and create a new database. For an external database, run
`npm run db:bootstrap`; the supplied Compose topology runs the same bootstrap
before Web startup. Seed data is created separately by the background Worker
after the schema exists.

For a new environment, the Compose `db-bootstrap` service creates the schema
before WuKongIM, Web, Worker, and Agent OS start. Later starts accept only
the complete marked v1 schema; an unmarked or partial database fails closed.
Operators then verify `/api/meta`, dependency health, authenticated channel
access and the release version. Web, Worker, and Agent OS processes never
execute DDL. Web and Worker use the same server image but have separate Compose
services, commands, restart policies, and replica counts. Rollback reuses the
complete v1 schema with the previous digest manifest; it does not attempt an
in-place schema downgrade.

When all four core `R2_*` secrets are configured, the production deployment
also reconciles the bucket CORS policy before application cutover. The
deployment image applies the policy and reads it back, requiring presigned
`PUT` permission for the production web origin plus the Electron renderer
origin (`app://lingxiloop`).
Partial R2 configuration or a failed readback aborts the deployment. Operators
can add comma-separated origins with `R2_CORS_EXTRA_ORIGINS` in `.env.secrets`.

Desktop artifacts contain only the renderer and Electron shell. Package
verification rejects server/runtime source and environment files.
