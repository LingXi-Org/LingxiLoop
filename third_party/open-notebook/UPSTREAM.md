# Open Notebook source provenance

- Upstream: https://github.com/lfnovo/open-notebook
- Audited base commit: `a7de90d38aaf18ee85fd661854d35c11e44613e2`
- License: MIT (`LICENSE`)
- Integration mode: repository-vendored backend and worker, built from this
  directory. LingxiLoop does not pull `latest` and does not run the optional
  Open Notebook MCP server.

LingxiLoop builds only the `lingxiloop-rag` target. Its supported fork surface
is stable Notebook provisioning, Source creation/extraction, Source-only scoped
search, the single native-v1 Surreal schema, and private R2 reads. Ask, Notes,
Insights, Source Chat, Podcasts, the Open Notebook frontend, and the upstream
migration chain are vendored source only and are not compatibility targets.

Any future upstream refresh must start from a reviewed commit, preserve the
scope-isolation tests, and update this file and `THIRD_PARTY_NOTICES.md`.
