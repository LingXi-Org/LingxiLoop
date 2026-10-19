# Course forum validation

Start the repository's disposable PostgreSQL and Redis services with `docker compose -f e2e/server/compose.yaml up -d --wait`, then run:

```sh
node e2e/server/forum.mjs --browser
```

The runner uses only local `lingxiloop_forum_test` on port 55432 and Redis database 4. It migrates twice (the second execution must be a no-op), runs the owning integration file, and starts the isolated browser fixture on API 53097 / Vite 53098. It writes results and screenshots under `artifacts/forum`. `--browser-only` repeats only browser validation after migration; without flags it runs only integration coverage.

The official `@e2e-dev/web` engine exercises actual forum, learning, uploads and file HTTP routes against PostgreSQL. The fixture replaces gateway login with three synthetic identities and replaces external object storage and WuKong with existing integration providers. Authentication provider login, external storage delivery and live model generation are outside this run's scope. No production environment file, model credentials or outbound notification configuration is loaded.

The browser journey covers course URL/reload/history/switching, the absence of standalone resource/case sections, student text/link/file submissions, latest and historical versions, peer download denial, teacher review, discussion authorship, comments, teacher pinning, closed assignments, and mobile dark-mode keyboard screenshots. The server suite additionally covers direct cross-course requests, revoked access, idempotency, late submissions and native Agent provenance/frozen-audience checks.

The #121/#187 scope check is repeatable with `XDG_CACHE_HOME=/workspace/.cache node e2e/server/forum.mjs --browser --issue187`; reports and screenshots are written to `artifacts/issue-187/forum`. This checks that resources remain outside the forum. Assignment references keep their existing authorization. No content or student submissions are migrated into shared cases.
