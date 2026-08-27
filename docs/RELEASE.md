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

Before the maintenance cutover, back up PostgreSQL, WuKongIM, SurrealDB, and
the Open Notebook data volume.
The migration is one-way: it removes retired Agent-host identities and data,
resets legacy conversations/runtime state, drops retired schema fields and
creates the Agent OS/WuKong projections. It does not dual-write.

Deployment runs migrations, starts WuKongIM and the control plane, then Agent
OS, and verifies `/api/meta`, dependency health, authenticated channel access
and the release version. Rollback restores both pre-cutover backups and the
previous digest manifest. It never re-enables a retired runtime.

When all four core `R2_*` secrets are configured, the production deployment
also reconciles the bucket CORS policy before application cutover. The
deployment image applies the policy and reads it back, requiring presigned
`PUT` permission for the production web origin plus Electron, iOS
(`capacitor://localhost`), and Android (`https://localhost`) renderer origins.
Partial R2 configuration or a failed readback aborts the deployment. Operators
can add comma-separated origins with `R2_CORS_EXTRA_ORIGINS` in `.env.secrets`.

Desktop artifacts contain only the renderer and Electron shell. Package
verification rejects server/runtime source and environment files.
