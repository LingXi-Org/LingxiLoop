# Organization case browser acceptance (#187)

Run `XDG_CACHE_HOME=/workspace/.cache node e2e/server/cases.mjs --browser-only` from the repository root after starting the local E2E PostgreSQL (55432) and Redis (56379) services. Requires the official `e2e` CLI, `@e2e-dev/web`, and its installed Chromium. The runner applies migrations twice, starts API 53107 and Vite 53108, and writes reports/screenshots under `artifacts/cases/`.

Isolation: the fixture refuses any database except `lingxiloop_cases_browser_test`; Redis uses database 5. Synthetic identities and the integration in-memory object provider replace only external infrastructure. Browser requests go to the real application HTTP API and PostgreSQL; browser responses are not intercepted or mocked. No production credentials or services are used.

Failure cases covered: unauthorized student writes; draft/unpublished detail and search leaks; stale public snapshots after unpublished edits; lost ownership boundaries when a different same-organization teacher edits; cross-organization list/detail/search/image leakage; missing images; route reload/history loss; cross-course visibility regressions; mobile overflow; invisible keyboard focus; retired forum resource aggregation; broken independent knowledge API.

Limit: these checks do not exercise live Open Notebook ingestion, SurrealDB, or vector retrieval. API/retrieval integration tests separately verify index version filtering and access boundaries; browser success must not be reported as proof of live embeddings.
