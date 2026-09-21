# Komodo production

Komodo v2.3.3 is the only production deployment control plane. `aly` runs
Core and MongoDB; `txy2` is `shanghai-a`, and `txy` is `shanghai-b`. Periphery
runs as a systemd service on all three hosts and connects outbound to Core.

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
