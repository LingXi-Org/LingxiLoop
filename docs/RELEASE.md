# Release and rollback

Pushes to `main` deploy only after lint, all TypeScript checks, builds, unit/integration tests and deterministic Agent Eval pass. No browser-test runner is installed or invoked by this workflow.

The workflow publishes four immutable GHCR digests (`lingxiloop-server`, `lingxiloop-agent-os`, `lingxiloop-wukongim`, `lingxiloop-open-notebook`), applies D1 migrations, builds Refine into Worker Static Assets, deploys `lingxiloop-control-plane`, then signs one idempotent release request with the commit SHA. The Worker passes the digest-pinned image variables to OpenShip; OpenShip owns the Shanghai rollout, health decision and rollback window. GitHub push auto-deploy must remain disabled in OpenShip.

Required GitHub `production` configuration:

- Variables: `CLOUDFLARE_ACCOUNT_ID`, `VITE_LINGXILIT_URL=https://openlit.lingxilearn.cn`.
- Secrets: `CLOUDFLARE_API_TOKEN`, `RELEASE_HMAC_SECRET`.

The management UI is published at `https://lingxiloop-control-plane.yangyangli0426.workers.dev`.
Do not add a `lingxilearn.cn` Worker Custom Domain: every备案 hostname must resolve directly to
`111.229.65.23`.

Required Worker secrets are managed only with `wrangler secret put`: `BETTER_AUTH_SECRET`, `GATEWAY_HMAC_SECRET`, `RELEASE_HMAC_SECRET`, `BOOTSTRAP_ADMIN_TOKEN`, `OPENSHIP_PAT`, `OPENSHIP_PROJECT_ID`, `RESEND_API_KEY`, `RESEND_FROM`, and optional Cloudflare Access service-token values. After the first verified administrator is created through `/api/internal/bootstrap-admin`, delete `BOOTSTRAP_ADMIN_TOKEN` with Wrangler.

`server/src/db/migrations/0001_v1_baseline.sql` remains immutable. The current cutover starts from empty PostgreSQL and D1 databases; PostgreSQL runs all migrations through the one-shot `db-migrate` service before Web/Worker startup. Application processes only check migration readiness.

Rollback is an OpenShip deployment action exposed in Refine. It changes digest-pinned application images, never reverses PostgreSQL or D1 migrations. Use a database backup paired with the earlier release if a forward-only schema change is incompatible.
