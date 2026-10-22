# Release

The server image contains the exact published LingxiOS dependency and its
Python runner. Database migrations must complete before Web or Worker starts;
App A and App B each run a Worker.

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

Ordinary chat always uses deep execution with all authorized capabilities.
Legacy response-policy and fast-model environment values no longer select a
restricted fast profile. Requests disable provider thinking for both main answers and auxiliary validation.
Providers may nevertheless return metered reasoning tokens; only final
content enters user previews. The default DeepSeek per-attempt timeout is 90 seconds,
with bounded native recovery; `AGENT_OS_MODEL_REQUEST_TIMEOUT_MS` overrides it. Verify the
real tool-result continuation before release.

The default chat model is SiliconFlow `deepseek-ai/DeepSeek-V4.1-Flash` at
`https://api.siliconflow.cn/v1`. Existing explicit `OPENAI_MODEL` and
`OPENAI_BASE_URL` values override defaults: update both deliberately during the
authorized release, and set `SILICONFLOW_USD_CNY_RATE` for the shared cost ledger.
The reviewed Komodo resource source pins `OPENAI_MODEL` for A/B and clears stale
admission-price overrides so Web/API and Worker derive them from the CN tariff. The embedding template pins `Pro/BAAI/bge-m3`, CNY 0.000070/K input tokens.
Read back effective model, base URL, exchange rate and price overrides on all four
services after rollout; Sigillo-only changes do not update running containers.
See [model switch evidence](evidence/issue-186/README.md) for the exact checks and remaining gates.
Existing knowledge embedding contracts reject a model/base change even when dimensions match. Prepare an independently verified compatible new index before switching an existing deployment; do not rename stored vectors, reset the knowledge plane, or delete the old index to make startup pass. Native memory retains its model/index-version contract.

The production operations MCP additionally requires the five Worker secrets
documented in `deploy/komodo/README.md`. Apply them with `wrangler secret put`,
then upload a new Worker version; never place their values in Git, CI output, or
operator transcripts.
