# Komodo production

**Control-plane migration accepted (2026-10-17):** Public HTTPS/API, all three
active agents, all eight running stacks and a successful database-backup
procedure have been verified on txy3. DNS points to `49.232.41.248`. Evidence
is in `artifacts/control-plane-migration-20261016/` from the repository root.
The independent wegolibrary application remains on aly and is outside this
deployment-control-plane migration.

Komodo v2.3.3 is the only production deployment control plane. `txy3`
(`49.232.41.248`, Komodo `manager`) runs Core, MongoDB and control ingress;
`txy2` is `shanghai-a`, and `txy` is `shanghai-b`. The legacy `aly` Server
record and its Periphery service are disabled; its existing wegolibrary is
independent. Periphery runs as a systemd service on the three active hosts
and connects outbound to Core. Releases do not depend on aly staying online.

The stable origin is `https://ops.christmas1314.xyz`; its DNS is managed in
Alibaba Cloud DNS. `core/` and `control-ingress/` are bootstrap infrastructure
on txy3 at `/opt/komodo/bootstrap/`, outside the product resource sync.
`aly-ingress/` preserves wegolibrary on aly, including the historical Compose
project name `control-ingress` and certificate volume `aly-ingress_traefik-acme`.
Do not apply the txy3 ingress manifest to aly. See the
[control-plane maintenance skill](../../.agents/skills/operate-komodo-production/references/control-plane.md)
for bootstrap, backups, cutover and rollback.

`resources.toml` owns the LingxiLoop stacks. Runtime variables and secrets are
stored in Komodo after being supplied from Sigillo; no `.env` file is committed.
The release workflow pins immutable images, syncs this resource file, and runs
the ordered `lingxiloop-production-rollout` procedure.

Before applying `0027_learning_collaboration`, drain affected interactive,
handoff, Mission and Canvas runs before changing the default rooms' members.
Then migrate, restart Web/API and workers, and let the existing IM channel
reconciliation restore membership. Do not change a running task's frozen audience.

Browser uploads also require the R2 bucket CORS policy in `../r2/cors.json`.
When provisioning or replacing the production bucket, apply it to the runtime
`R2_BUCKET` using `sigillo run -p <project-id> -c prod -- node
node_modules/wrangler/bin/wrangler.js r2 bucket cors set <bucket> --file
deploy/r2/cors.json --force` from the repository root. Verify with `r2 bucket
cors list <bucket>` and an OPTIONS request from the app origin followed by a
presigned PUT. Missing CORS blocks the browser before the file reaches R2 and
leaves the source in `upload_pending`.

`/opt/apps/wegolibrary`, its Compose project, images, containers, and network
are outside Komodo and must be preserved. Memos and all Arcane resources are
retired and must not be recreated.
