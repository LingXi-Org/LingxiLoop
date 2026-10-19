# Course forum validation

Start the repository's disposable PostgreSQL and Redis services with `docker compose -f e2e/server/compose.yaml up -d --wait`, then run:

```sh
node e2e/server/forum.mjs --browser
```

The runner uses only local `lingxiloop_forum_test` on port 55432 and Redis database 4. It migrates twice (the second execution must be a no-op), runs the owning integration file, and starts the isolated browser fixture on API 53097 / Vite 53098. It writes results and screenshots under `artifacts/forum`. `--browser-only` repeats only browser validation after migration; without flags it runs only integration coverage.

The official `@e2e-dev/web` engine exercises actual forum, learning, uploads and file HTTP routes against PostgreSQL. The fixture replaces gateway login with three synthetic identities and replaces external object storage and WuKong with existing integration providers. Authentication provider login, external storage delivery and live model generation are outside this run's scope. No production environment file, model credentials or outbound notification configuration is loaded.

The browser journey covers course URL/reload/history/switching, the absence of standalone resource/case sections, student text/link/file submissions, latest and historical versions, peer download denial, teacher review, discussion authorship, comments, teacher pinning, closed assignments, and mobile dark-mode keyboard screenshots. The server suite additionally covers direct cross-course requests, revoked access, idempotency, late submissions and native Agent provenance/frozen-audience checks.

The #121/#187 scope check is repeatable with `XDG_CACHE_HOME=/workspace/.cache node e2e/server/forum.mjs --browser --issue187`; reports and screenshots are written to `artifacts/issue-187/forum`. This checks that resources remain outside the forum. Assignment references keep their existing authorization. No content or student submissions are migrated into shared cases.

## Focus canvas (#184)

```sh
node e2e/server/forum.mjs --browser-only --issue184
node e2e/server/forum.mjs --browser-only --issue163
```

The #184 run selects three official-engine browser journeys and writes its report and screenshots to `artifacts/forum/issue184/browser`. It checks real file/image uploads (pending, failure and retry), separate body/reference links, image preview, material counts/removal, tags/source references, saved drafts, failed/successful publishing, assignment fields and student permissions. The responsive matrix covers 1440px and 390px in both themes: compact, ordinary editor with materials closed/open, focus mode, portal interaction and keyboard collapse. #163 separately retains account-avatar and roster-refresh regressions with the updated material tray and scoped palette.

These focused runs cover only homework/free discussion and normal materials/source references, consistent with the scope of #121/#187. They do not validate the retired case-publishing or independent-resource aggregation flows. Synthetic identity and storage limitations above still apply. The attachment upload fixture can hold or fail the next local presign request; successful requests continue through the ordinary upload service. No live authentication, production storage, production deployment or outbound notifications are exercised.

Use Node.js 22 and the installed official Chromium engine (`npm run test:e2e:install`). If dependencies are shared through a worktree symlink, ensure bundled fonts are served normally before retaining screenshot evidence; a local dependency installation avoids Vite's outside-root font denial without changing filesystem security settings. Retained review evidence and reproduction details live in `docs/evidence/issue-184/`.
