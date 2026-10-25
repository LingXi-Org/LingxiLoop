# Cases 448/449/451 targeted acceptance

One synthetic case, one browser workflow, one viewport, zero retries. The new opt-in fixture is guarded by `NODE_ENV=test`, `CASES_AUTHORING_COVER_FIXTURE=1` and exact database name `lingxiloop_cases_449_browser_test`. Ordinary case traffic uses the existing real HTTP API; a test-only endpoint reads the corresponding PostgreSQL row. Existing default fixtures keep their original database guard.

## Actual results

- `node e2e/cases/run-authoring-covers.mjs --http-only`: exit 0; six named contract checks passed. Real POST/PUT/GET/publish and direct SQL read agree on native summary/body documents and acknowledged version. The same synthetic case is finally deleted through the real DELETE endpoint; SQL retains its `deleted_at` tombstone, reader/manage GET return 404, and the management list omits it. One synthetic case, eight fixed cover states, one successful DELETE, zero model calls. Receipt: `http-results.json`.
- Focused E2E TypeScript check and official single-workflow collection passed. Collection alone executes no browser assertions.
- API 53107 and web 53108 were confirmed closed after fixture cleanup. Task-owned synthetic PostgreSQL/Redis remain available for the parent integration checks.

## Browser blocked without launch

Read-only preflight found `/usr/lib/chromium/chrome-sandbox` still owned by `nobody:nogroup`, mode 4755, reproducing the already-known invalid SUID helper configuration. No Chromium/Chrome/headless-shell process or usable existing CDP session was present. The official engine supports Firefox/WebKit, but no installed alternative browser or valid alternative helper was found in the local executable/cache paths. No browser was launched or downloaded, no sandbox flags or system/security/network configuration changed, and no repeated launch attempted. This is an environment prerequisite block, not an approval rejection or product assertion failure.

Browser tests started **0**; UI assertions **0**; screenshots **0**; before/after crops **0**; screencasts **0**; official browser run ID **none**. No old or fabricated image replaces the missing evidence.

## Prepared, unexecuted browser workflow

`e2e/cases/authoring-covers.e2e.ts` uses official `@e2e-dev/web`: native authoring → save → real API/SQL persistence; failed save retains input; successful save retains preview; partial publish failure retains the saved draft; successful publish/reload; legacy, pending, generating, failed, cancelled and ready cover states; return to the homepage and identify the unique synthetic grid card, then its first real hover with a stationary pointer must change the actual Worker-produced SVG; asset and VM failure fallback; finally, list deletion cancellation must issue no DELETE, a controlled DELETE 503 must retain the record and open retryable dialog, and successful retry must return to the management list with a SQL tombstone and both GET views returning 404. These added cancellation/failure/retry UI assertions remain unexecuted. The config retains video/trace and the workflow captures real screenshots plus CDP-clipped homepage-card before/after images when a valid normal-sandbox browser becomes available. None of these UI/VM/visual assertions passed in this environment.

Generated-cover fixtures contain a clearly marked fixed synthetic SVG and QuickJS program. They test persisted asset transport/state contracts; they do not demonstrate live model generation or successful VM execution. Model endpoint is deliberately unavailable, no worker/model service is started.

## Reproduce

```sh
env -i PATH="$PATH" HOME="$HOME" bash -c 'source docs/evidence/issue-449/integration-env.sh; node --import tsx server/src/migrate-bin.ts'
node node_modules/typescript/bin/tsc -p docs/evidence/issue-449/tsconfig.e2e-focused.json
E2E_TELEMETRY_DISABLED=1 node node_modules/e2e/dist/cli/bin.js list --config e2e.case-authoring-covers.config.ts
node e2e/cases/run-authoring-covers.mjs --http-only
```

The dedicated task-owned local services are PostgreSQL 55432 and Redis 56379, synthetic password `lingxiloop-e2e-local`. Auth database is `lingxiloop_cases_449_auth_test`/Redis 8; browser fixture database is `lingxiloop_cases_449_browser_test`/Redis 9. Both were initialized through 0055; the #451 HTTP fixture run applied browser-database migrations through 0057. No real `.env` or production data is used. A future browser run additionally requires an independently verified normal-sandbox CDP endpoint via `E2E_AUTHORING_COVER_CDP_URL`; this runner never launches/downloads browsers or changes sandbox settings.
