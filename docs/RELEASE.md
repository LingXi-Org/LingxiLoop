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

The M9 ContextThread cutover is reset-only. It adds authoritative
`context_threads` and `context_thread_participants` relations; environments
created before this cutover must reset before startup.

The M10 notification-router cutover is reset-only. It replaces the Learning-only
preference and delivery tables with canonical Intent, Preference, Delivery, and
Delivery-to-Intent relations; environments created before this cutover must reset.

The M11 Teacher Free cutover is reset-only. Course invitations are replaced by
Project-owned Student invitations, and Teaching Projects receive an explicit
Teacher Plan override; environments created before this cutover must reset.

The M12 Attention cutover is reset-only. It adds canonical Attention Item and
event-projection ledger relations; environments created before this cutover
must reset before Worker startup.

The M13 Teacher Briefing cutover is reset-only. It adds meaningful Project
visit watermarks plus durable Briefing and Briefing-to-Attention relations;
environments created before this cutover must reset before Worker startup.

The M14 Approval cutover is reset-only. It replaces `agent_approvals` and
`agent_os_approvals` with one canonical `approvals` relation and uppercase
lifecycle states; environments created before this cutover must reset before
Web or Agent OS startup.

The M17 Personal Plus cutover is reset-only. It adds canonical personal
subscriptions and the append-only subscription usage ledger; environments
created before this cutover must reset before startup.

The M18–M21 Education cutover is reset-only. It adds Contract and Seat-backed
Education Companies, Institutional Courses, and the durable Project Transfer
contract. Transfer completion changes the existing Project and its mutable
tenant-owned children in one transaction; historical Event, Audit, and L4
ledgers keep their original tenant provenance. Environments created before this
cutover must reset before startup; there is no in-place ownership backfill.

The M22 knowledge-scope cutover is reset-only. It adds explicit Organization
and Course bindings over one canonical ingested source; it does not copy source
content, chunks, or Learning State. Environments created before this cutover
must reset before startup.

The M24 Trust BFF cutover is reset-only. Signed Trust snapshots are immutable,
tenant-scoped records backed by canonical Evidence; existing environments must
reset before snapshot creation is enabled.

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

## M18 Education Core reset requirement

M18 adds canonical Education Contract and Organization Seat relations. M19 atomically expires due contracts, enters Company grace, and ends active Institutional Courses while preserving independent Membership and Seat assignments for close-out. Education entitlements require an active Seat backed by an in-period contract or its expired contract during Company grace. This is a reset-only schema cutover: reset and bootstrap the database; no migration or dual-write path is provided.

M20 adds a dedicated Institutional Course creation use case for Education Companies. Course roles are assigned only to existing School Memberships; role assignment neither creates a User nor allocates a Seat.

M21 adds the reset-only Project Transfer relation for dual confirmation and policy snapshots. Reset and bootstrap the database before exercising Transfer; no migration path is provided.
