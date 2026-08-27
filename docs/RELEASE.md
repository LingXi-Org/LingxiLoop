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
databases, create a new database, then run `npm run db:bootstrap` exactly once.
Seed data is created separately by the application after the schema exists.

For a new environment, operators run the Compose `db-bootstrap` tool once before
starting WuKongIM, the control plane, and Agent OS, then verify `/api/meta`, dependency health,
authenticated channel access and the release version. Web and Agent OS
processes never execute DDL. Rollback recreates an empty v1 database and deploys
the previous digest manifest; it does not attempt an in-place schema downgrade.

Desktop artifacts contain only the renderer and Electron shell. Package
verification rejects server/runtime source and environment files.
