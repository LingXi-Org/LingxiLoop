# Release and rollback

Production deploys three immutable application images:

- `LINGXILOOP_SERVER_IMAGE`
- `AGENT_OS_IMAGE`
- `WUKONGIM_IMAGE`

All must use `image@sha256:…`. WuKongIM v3 is built from verified commit
`c7f663fa23a4ee2c6f7e08c68423f50f0f6e9c47` and then pinned by image digest.
Operators provide `.env.secrets`; CI uploads only `.release.next.env`, Compose
and deployment scripts.

Before the maintenance cutover, back up PostgreSQL and the WuKongIM volume.
The migration is one-way: it removes retired Agent-host identities and data,
resets legacy conversations/runtime state, drops retired schema fields and
creates the Agent OS/WuKong projections. It does not dual-write.

Deployment runs migrations, starts WuKongIM and the control plane, then Agent
OS, and verifies `/api/meta`, dependency health, authenticated channel access
and the release version. Rollback restores both pre-cutover backups and the
previous digest manifest. It never re-enables a retired runtime.

Desktop artifacts contain only the renderer and Electron shell. Package
verification rejects server/runtime source and environment files.
