# Open Notebook source provenance

- Upstream: https://github.com/lfnovo/open-notebook
- Audited base commit: `a7de90d38aaf18ee85fd661854d35c11e44613e2`
- License: MIT (`LICENSE`)
- Integration mode: repository-vendored backend and worker, built from this
  directory. LingxiLoop does not pull `latest` and does not run the optional
  Open Notebook MCP server.

LingxiLoop-native changes are intentionally part of this source tree:

- stable, unique `Notebook.external_key` provisioning;
- required Notebook scope plus Source allow/exclude lists on Search and Ask;
- SurrealDB-level scoped text/vector functions;
- Ask graph propagation of the resolved Source and Note scope;
- Notebook-scoped Source Chat verification and the Insight update endpoint
  required by the typed Host approval surface;
- private R2 persistence for uploaded Source originals and generated Podcast
  audio, using LingxiLoop's existing bucket credentials and an isolated prefix.

Any future upstream refresh must start from a reviewed commit, preserve the
scope-isolation tests, and update this file and `THIRD_PARTY_NOTICES.md`.
