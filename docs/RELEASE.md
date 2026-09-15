# Release

The server image contains the exact published LingxiOS dependency and its
Python runner. Database migrations must complete before Web or Worker starts;
only App B runs the Worker.

The GitHub workflow publishes immutable commit-tagged images, pins the four
Compose projects under `deploy/komodo`, applies D1 migrations when needed, and
deploys the Admin Worker. It then triggers the signed Komodo rollout procedure.

Komodo v2.3.3 owns deployment state. Verify the rollout update reaches terminal
success and then run service health checks. Komodo variables hold product configuration and secrets. External
credentials come from Sigillo and must never be committed or printed.

Required GitHub production secrets are `CLOUDFLARE_API_TOKEN` and
`KOMODO_WEBHOOK_URL`, `KOMODO_WEBHOOK_SECRET`, `KOMODO_API_KEY`, and `KOMODO_API_SECRET`. Required Worker secrets are managed with
Wrangler. After `/api/internal/bootstrap-admin` creates the first verified
administrator, delete `BOOTSTRAP_ADMIN_TOKEN`.

Production is forward-only. Fix failed releases in place; there is no retained
application-state rollback for the first Komodo release.

The production operations MCP additionally requires the five Worker secrets
documented in `deploy/komodo/README.md`. Apply them with `wrangler secret put`,
then upload a new Worker version; never place their values in Git, CI output, or
operator transcripts.
