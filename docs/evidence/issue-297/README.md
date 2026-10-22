# Model defaults and price provenance

Issue: https://github.com/LingXi-Org/LingxiLoop/issues/297

New general chat defaults are `deepseek-ai/DeepSeek-V4.1-Flash`. New embedding defaults are `Pro/BAAI/bge-m3`; independent rerankers and historical ledger model/rate snapshots remain unchanged. The eval candidate follows the chat default; the independent judge remains independently configured.

Official sources checked 2026-10-22:

- https://www.siliconflow.cn/models: exact chat ID, 1,048,576 context, tool calling, JSON mode and visual input capability.
- https://www.siliconflow.cn/pricing: the public component object explicitly names `realTimePriceCnyUnit`, `unitZhCnName: K tokens` and `pro/baai/bge-m3.online.input-tokens`. Input CNY 0.000070/K equals CNY 0.07/M, before explicit USD conversion. Sanitized numeric metadata is in `provider-metadata.json`.
- https://docs.siliconflow.cn/docs/release-notes/overview: provider time-based billing periods use Beijing time. The current V4.1 price component's 02:00–08:00 period maps to Asia/Shanghai.

DeepSeek CNY/M input/cache/output: standard 2/0.04/8; off-peak 1/0.02/4. Admission without a request timestamp uses a conservative standard-price estimate. Product requests can pass their real issued timestamp to freeze a tariff; native observations without an exact request start keep the labelled conservative estimate. There is no model switching by time. Measured usage and provider invoices remain authoritative; these are tariff-based cost estimates.

Memory BGE verifies 1,024 returned dimensions instead of sending unsupported dimension reduction. Existing native model/index-version isolation stays enabled. The Open Notebook RAG bootstrap already rejects a changed stored model/base contract. Equal vector dimensions do not establish embedding compatibility: an existing knowledge index needs a separately verified new-index migration before switching that deployment. This change neither rebuilds nor deletes any real index or rebrands old vectors.

Validation (Node 22.23.3, locked LingxiOS 3.8.0): focused pricing/memory tests 4/4; rendered A/B/default-template contracts 2/2; server typecheck passed. Server lint's initial test callback warning was corrected before final validation. Existing ledger/recovery regressions and final lint results are recorded with the PR.

Deployment boundary: repository defaults and templates changed; effective production environment has not been read or changed. The production MCP 403/Cloudflare 1010 refusal remains binding, with no retry or alternate production route. A live paid provider completion was not run; official metadata, deterministic local regressions and the exact dependency checks establish the recorded scope. Commits use `[skip deploy]` so GitHub merge does not initiate a production rollout.
