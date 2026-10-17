# Issue #160 — client connection recovery (draft)

Base: `2db5bbcddc8f14ac62500e36594dc49793c9e096` (`origin/main`, 2026-10-17).
Branch: `fix/issue-160-client-recovery`. No existing open PR or PR matching #160 was found before implementation.

## Implemented boundaries

- Boot, realtime WS hello, IM connected, browser online and delayed retries enter one outbox drain per transport/scope generation. A cycle has at most 5 passes of 20 entries, one concurrent recovery send, 3 attempts per nonce, a 60-second total deadline and 10-second request deadlines. Backoff includes jitter. Network wake-ups coalesce with the current cycle without extending its deadline.
- Recovery reads the existing nonce first. Accepted echoes must match sender/channel/nonce and contain a message ID and positive safe integer sequence. Missing/pending use the existing idempotent accept endpoint with the original payload/nonce; unknown states and invalid accepted echoes remain pending. No replacement message ID or model work is created by recovery.
- Failed messages retain their serialized attachments and manual check/retry/remove actions. Permanent HTTP 400/401/403/404/409/410/422 failures stop automatic sending. A status lookup's 404 remains the existing `missing` protocol; a subsequent accept still enforces channel permissions. An IM echo that arrives before an HTTP failure cannot be reverted to failed delivery.
- Outbox entries record their project while retaining the existing company/user storage partition. Legacy entries require the active workspace channel allowlist before replay. Scope generations abort drains/streams on A → B → A, revocation and disconnect. Auth teardown cancels synchronously.
- SSE is supplemented by authoritative snapshot reads every 15 seconds, including when the stream remains open but loses its final frame. Reads have a 10-second deadline. Connection failures display “连接中断，状态待确认。” without changing the durable lifecycle to failed. After 60 seconds without authoritative confirmation, local active occupancy is released; the record and background checks (30 seconds) remain. Permanent read/stream errors stop automatic subscriptions and expose a manual status check.
- Existing concurrent composer submission remains in use. #152's stopped-run history hydration is retained. No server protocol, migration, dependency manifest or lockfile was changed.

## Authored browser coverage

`e2e/web/connection-recovery.e2e.ts` was started before production edits. It uses `tester-army/e2e` 0.17.0 and official `@e2e-dev/web` 0.12.0, with no direct Playwright import or browser route fulfillment.

The 13 cases cover boot failure with backoff/online/WS hello/IM wake-ups, accepted response loss, accepted sequence zero, permanent 401/403/404 send errors with explicit manual retry, rapid A → B → A, SSE cut, silent SSE terminal loss, and service outage with bounded local waiting. Assertions inspect unique authoritative IM message counts, accept attempts, drain concurrency, attachment counts, retained composer text, active run occupancy, durable lifecycle and work item count. Screenshots/video are requested by the commands below.

The isolated fixture supplies test login identity and a realtime hello socket. Ordinary product HTTP routes, tenant/project permissions, PostgreSQL, real pinned WuKongIM, and LingxiOS own the tested state. Faults are injected in a loopback HTTP proxy. Attachment bytes use the established integration storage provider; this does **not** validate browser upload/S3 behavior. The model provider deliberately does not answer, so the remote run ends through a real persisted failure; live successful LLM completion/result delivery is **not** covered.

## Actual validation and blocker

Frozen installation is blocked: preinstalled `node_modules` contained LingxiOS **3.3.8**, while manifest/lock require **3.4.7**. `npm ci --cache /tmp/lingxi-issue160-npm-cache --no-audit --no-fund` returned **E401** for the locked GitHub Packages URL. A normal authenticated download also returned 401. No credentials, integrity checks or dependency versions were changed to work around this. Failed `npm ci` removed the stale modules; the workspace now requires a successful frozen install.

Results on the final source that do not require that dependency:

- Exact Biome 2.5.8, installed separately with `npm exec`, linted `src vite.config.ts`: **exit 0**, no errors, 2 pre-existing warnings and 2 pre-existing informational findings in untouched files.
- `node --check e2e/connection-recovery-server.mjs`: **exit 0**.
- TypeScript syntax-only transpilation of nine changed production/fixture files: **0 syntax errors**. This is not a semantic typecheck.
- `git diff --check`: **exit 0**.

Earlier diagnostic results used the stale 3.3.8 install and **are not acceptance evidence**: web `typecheck` and E2E test typecheck exited 0; the web suite passed 87/87 after adapting the existing IM mock to the new connection subscription; one online browser recovery scenario produced a screenshot. That browser run was interrupted when the dependency mismatch was confirmed. No final frozen-dependency browser pass, build, screenshot or recording is claimed.

## Re-run with the authorized locked package available

Use Node 22 and the repository's existing disposable service setup. Do not use production data or `.env.local`.

```sh
npm ci --cache /tmp/lingxi-issue160-npm-cache --no-audit --no-fund
node -p "require('./node_modules/@lyyzka/lingxios/package.json').version"
# Must print 3.4.7.
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e:typecheck

docker compose -p lingxiloop-e2e -f e2e/server/compose.yaml -f e2e/browser.compose.yaml up -d --build
node --import tsx e2e/connection-recovery-server.mjs
# Separate terminal:
LINGXILOOP_DEV_API_TARGET=http://127.0.0.1:5199 LINGXILOOP_DEV_WS_TARGET=ws://127.0.0.1:5199 npx vite --host 127.0.0.1 --port 5196 --strictPort
# Separate terminal:
E2E_CONNECTION_RECOVERY=1 E2E_BASE_URL=http://127.0.0.1:5196 npm run test:e2e:web -- e2e/web/connection-recovery.e2e.ts --output .e2e/issue160 --video on
```

In the selected cloud image, add `/workspace/.lingxi-setup/browser-local-images.yaml` to Compose to use the prepared pinned service images; use `XDG_CACHE_HOME=/workspace/.lingxi-setup/cache` for the prepared official browser. The fixture server binds only to loopback and inserts uniquely named synthetic records in `lingxiloop_integration_test`; it does not truncate a database. Do not run other integration fixtures against that database concurrently.

Retain `.e2e/issue160/report.json`, `junit.xml`, `summary.md`, `run-metadata.json`, screenshots and video. Raw browser traces may contain synthetic authentication material and must remain ignored. Publish only reviewed screenshots and counts with nonce values omitted or hashed.

## Not accepted yet

- All final checks and all 13 browser cases on frozen LingxiOS 3.4.7; final screenshots/recordings.
- Joint validation with #154's server receipt reconciliation, including historical invalid cached receipts and real successful result/delivery recovery.
- Real authentication/session expiry, upload/S3 recovery, browser-generated offline/online transitions, separate project-only revocation/logout flows, multi-tab recovery and live model completion.
- Astra review/integration. This change must remain a draft; no merge or deployment was performed.
