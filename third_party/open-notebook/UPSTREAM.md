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
Insights, Source Chat, Podcasts and the Open Notebook frontend are retired.
Their source remains in LingxiLoop history at commit
`7424a10210a4f82c32ff893945f98c4f37e78fef`; it is no longer vendored here.
The upstream migration chain remains as historical schema reference and is not
a compatibility target. The native-v1 RAG schema owns the supported lifecycle.

Any future upstream refresh must start from a reviewed commit, preserve the
scope-isolation tests, and update this file and `THIRD_PARTY_NOTICES.md`.
