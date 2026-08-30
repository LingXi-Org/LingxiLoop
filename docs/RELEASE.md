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
upgrade, transitional ALTER, or data backfill path: discard pre-v1 development
databases and create a new database. For an external database, run
`npm run db:bootstrap`; the supplied Compose topology runs the same bootstrap
before Web startup. Seed data is created separately by the background Worker
after the schema exists.

The M6 learning-foundation cutover is reset-only and destructive. It replaces
the course-owned objective/mastery tables with project-owned knowledge units,
learning states, activities, missions, evidence and LearningCase ledgers. There
are no compatibility relations, triggers, retained legacy tables or dual writes.
Back up any database that must be preserved, then drop and recreate it from the
current `server/src/db/schema.sql`; even a previously marked v1 database must be
reset if it predates this cutover.

The M7 event-foundation cutover is also reset-only. A database created before
`domain_events` gained its identity cursor, aggregate sequence, bounded payload
constraints, and append-only trigger must be dropped and recreated; no runtime
upgrade or backfill path exists.

The M8 evidence-foundation cutover is reset-only as well. It introduces the
canonical L1/L2 Evidence, provenance-link, and human-reviewed Claim relations;
databases created before these relations exist must be dropped and recreated.

For a new environment, the Compose `db-bootstrap` service creates the schema
before WuKongIM, Web, Worker, and Agent OS start. Later starts accept only
the complete marked v1 schema; an unmarked or partial database fails closed.
Operators then verify `/api/meta`, dependency health, authenticated channel
access and the release version. Web, Worker, and Agent OS processes never
execute DDL. Web and Worker use the same server image but have separate Compose
services, commands, restart policies, and replica counts. Rollback restores the
database snapshot paired with the previous digest manifest; it never reuses a
database written by another release or attempts an in-place schema downgrade.

All six `R2_*` values are mandatory: endpoint, bucket, access key, secret key,
public base URL and URL-signing secret. The production deployment reconciles
the bucket CORS policy before application cutover. The
deployment image applies the policy and reads it back, requiring presigned
`PUT` permission for the production web origin plus the Electron renderer
origin (`app://lingxiloop`).
Partial R2 configuration or a failed readback aborts the deployment. Operators
can add comma-separated origins with `R2_CORS_EXTRA_ORIGINS` in `.env.secrets`.

Desktop artifacts contain only the renderer and Electron shell. Package
verification rejects server/runtime source and environment files.
