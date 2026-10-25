# Disposable browser acceptance environment

Only local disposable services are used. No production writes, deployment, authorization bypass, or direct Playwright calls.

Initial setup observations (2026-10-25):

- `docker compose -f e2e/server/compose.yaml up -d --wait` passed (PostgreSQL 55432, Redis 56379).
- Standard browser compose failed pulling `minio/minio:RELEASE.2025-09-07T16-13-09Z`: `pull access denied ... denied: requested access to the resource is denied`.
- Existing environment-provided `lingxiloop-cloud-minio:20250907` and `lingxiloop-cloud-wukongim:c7f663fa23a4` images started successfully with the unchanged service configuration and a temporary storage image override. Images have no registry RepoDigest; this local verification is not a production image admission claim.
- Initial `node e2e/local-api.mjs` failed before migrations with `exact formal runtime package and matching root/server manifests/locks required`: installed LingxiOS was 3.5.2 while locks require 3.8.12. Parent restored exact locked dependencies; no migration or runtime checks were bypassed.

Browser fixture files in `e2e/fixtures/course-materials` are synthetic. The tests use the actual API, signed object storage uploads and authenticated downloads. `E2E_COURSE_MATERIALS=1` and `E2E_MUTATIONS=1` explicitly opt into these writes in a disposable workspace. The separate `knowledge.e2e.ts` still requires a real Notebook/worker environment and is not claimed by the original-file tests.

The pre-existing disposable browser DB had 38 historical migrations and correctly refused direct startup under 3.8.12. It was preserved as `lingxiloop_browser_test_pre450`; a new `lingxiloop_browser_test` initialized through the normal migration runner with all 56 product migrations. Server and root installed packages both match 3.8.12.

The nested filesystem tool sandbox remaps Chromium's setuid helper ownership, so Chromium refused startup there. Starting the same Chromium command through approved execution outside that nested sandbox succeeded with its normal browser sandbox enabled. No `--no-sandbox`, browser security disabling, request authorization bypass, or mock responses are used. Official `@e2e-dev/web` connects over loopback CDP9227.

Control-plane configuration and logging are contained under `.e2e/config` using `XDG_CONFIG_HOME` and `WRANGLER_LOG_PATH`; no global configuration directory is modified.

Focused browser test TypeScript check passed:

```sh
./node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler e2e/web/course-materials.e2e.ts e2e/web/knowledge.e2e.ts e2e/web/business-layout.e2e.ts e2e/web/workspace.e2e.ts
```

The broader `npm run test:e2e:typecheck` failed on pre-existing unrelated `e2e/react-delivery/recovery.e2e.ts` JSON value types, project alias resolution and root/server dependency private-type identities. Focused checks do not imply that global command passed.

## Actual browser failures and supported corrections

The first full browser attempt reached real uploads, refresh and authenticated download, and passed teacher access denial, but failed screenshot capture with `POLICY_DENIED`: `app.screenshot() is denied after a secret fill because the app may display the secret outside a secure field`. Those UI-login sessions retain their original secret provenance. No session file or screenshot-policy setting was modified.

The installed official framework documentation (`node_modules/e2e/docs/security.mdx`, lines 104–116) explicitly permits a setup that signs in without filling a secret, for example setting a genuine session cookie, to retain screenshot capability. `course-materials-screenshots.e2e.ts` follows that supported method: it reads the actual rendered Turnstile response, submits ordinary fixture credentials to the actual sign-in endpoint, installs only the server-returned cookie through `browser.setCookies`, then opens the real course page and captures it. Credentials, captcha responses and cookies are never printed or copied to evidence. Ordinary UI-login acceptance remains separate and passes.

Another actual harness failure used a download's attempt-relative path as a filesystem path. The fixed runner validates the official report's saved download artifacts afterward, matching the existing canvas-export approach; every original-file download is compared byte-for-byte and checked against its reported SHA-256.

Repeated rapid real logins also reached the active normal authentication rate limit (HTTP 429). The final tests wait 11 seconds before fresh role logins, allowing the normal three-sign-ins/10-second window to expire. The rate-limit configuration remains enabled and unchanged. One normal disposable fixture reset ran before the final candidate run; subsequent retries use natural expiry.

Fixture cleanup initially left old query-cache rows on screen; waiting only for matching file names caused an early reload that cancelled the new upload. The corrected test refreshes after its fixture cleanup and explicitly waits for all seven `已保存` statuses before reloading. This was a harness synchronization error, not claimed as passing product coverage.

All failed native reports/traces remain in ignored `.e2e/issue450-browser-*` folders. Sanitized per-case outcomes are retained in `browser-prior-attempts.json`; raw session storage, authentication headers and cookies are excluded from committed evidence.

## Reproduce with the same local services

Start the existing disposable compose services and seed the API/control fixture as described in `e2e/README.md`. For a proxy-restricted environment, seed control once using `e2e/admin/start-control.mjs --seed-only`, then run the real Worker through the supplied transport adapter:

```sh
NODE_USE_ENV_PROXY=1 XDG_CONFIG_HOME="$PWD/.e2e/config" WRANGLER_LOG_PATH="$PWD/.e2e/wrangler-materials.log" node e2e/admin/start-control-proxy.mjs
```

This adapter forwards real outbound requests using the host's ordinary proxy and trusted certificate configuration. It does not mock any response or alter the auth, captcha, API or storage services.

The latest production preview was rebuilt into `.e2e/dist-web-450-final` with the normal public Turnstile test site key and local Worker/API proxy targets; the API was restarted after the final uploader-name change. Screenshot tests set the existing normal `lingxiloop-theme` preference to `light` before navigating. `browser-build.json` records the exact build index and relevant source hashes, plus the genuine screenshot hashes.

The final broad focused run reached 13 passed checks and two authentication-readiness failures. Both failed screens contained only the genuine retry alert; the real Worker recorded HTTP 429 on `/api/auth/get-session` after successful sign-in. A read-only query confirmed the existing active global policy of 60 requests / 60 seconds. This policy was not modified. The two cases were selected alone for a follow-up after the natural minute window elapsed, retaining the original failures alongside follow-up evidence.

The final run's seven-file lifecycle case passed, and the official download artifact validator was also invoked independently against that passed case even though unrelated authentication-readiness cases had failed in the broader run. Its byte-for-byte and report-checksum proof is `course-materials-downloads.json`.

## Final result

The latest production-preview run recorded **13 passed, 2 failed**, with both failures caused by real `/api/auth/get-session` HTTP 429 responses under the unchanged 60-requests/60-second policy. After natural expiry, the focused follow-up recorded **3 passed, 0 failed**: the second-student isolation case, the module/history case, and their one required UI-login setup. This is **15 unique checks verified across the two runs**, not a single 15/15 run. `browser-results.json` retains each run's exact selected outcomes and maps each final case to its proving run ID.

For repeatable local verification, use bounded selections and let the existing minute window naturally expire between groups. Do not clear or weaken the policy to force a result:

1. Run `course-materials.e2e.ts` with `--grep 'teacher uploads public|student public view|student files upload'` for original-file lifecycle and public roles.
2. After the natural minute window expires, run the same file with `--grep 'cannot list'` for both private-isolation actors.
3. After expiry, run `course-materials-screenshots.e2e.ts` for the three genuine-cookie light-theme screenshots.
4. After expiry, run the focused material navigation, command-palette and role-layout cases.

Use the documented `E2E_COURSE_MATERIALS=1`, `E2E_MUTATIONS=1`, `E2E_CDP_URL=http://127.0.0.1:9227`, `E2E_BASE_URL=http://127.0.0.1:5180` and the normal official `npm run test:e2e:web -- ...` wrapper. Full native run artifacts remain in `.e2e/issue450-browser-latest` and `.e2e/issue450-browser-followup`; committed evidence omits all session storage/cookie actions.

The optional Notebook/worker ingestion browser case was migrated to the new page, but not executed because its actual Notebook/worker prerequisites were not started. Original-file persistence/download acceptance is separate and passed for all seven fixture formats.
