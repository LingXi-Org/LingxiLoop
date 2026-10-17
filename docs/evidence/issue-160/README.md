# Issue #160 — client connection recovery (draft)

Base: `2db5bbcddc8f14ac62500e36594dc49793c9e096` (`origin/main`, 2026-10-17).
Branch: `fix/issue-160-client-recovery`. No existing open PR or PR matching #160 was found before implementation.

## Implemented boundaries

- Boot, realtime WS hello, IM connected, browser online and delayed retries enter one outbox drain per transport/scope generation. A cycle has at most 5 passes of 20 entries, one concurrent recovery send, 3 attempts per nonce, a 60-second total deadline and 10-second request deadlines. Backoff includes jitter. Network wake-ups coalesce with the current cycle without extending its deadline.
- Recovery reads the existing nonce first. Accepted echoes must match sender/channel/nonce and contain a message ID and positive safe integer sequence. Missing/pending use the existing idempotent accept endpoint with the original payload/nonce; unknown states and invalid accepted echoes remain pending. No replacement message ID or model work is created by recovery.
- Failed messages retain their serialized attachments and manual check/retry/remove actions. Permanent HTTP 400/401/403/404/409/410/422 failures stop automatic sending. A status lookup's 404 remains the existing `missing` protocol; a subsequent accept still enforces channel permissions. An IM echo that arrives before an HTTP failure cannot be reverted to failed delivery.
- Outbox entries record their project while retaining the existing company/user storage partition. Legacy entries require the active workspace channel allowlist before replay. Scope generations abort drains/streams on A → B → A, revocation and disconnect. Auth teardown cancels synchronously; the redundant deferred logout disconnect is removed so it cannot cancel a new sign-in. A browser regression test first reproduced that race before the auth change.
- SSE is supplemented by authoritative snapshot reads every 15 seconds, including when the stream remains open but loses its final frame. Reads have a 10-second deadline. Connection failures display “连接中断，状态待确认。” without changing the durable lifecycle to failed. After 60 seconds without authoritative confirmation, local active occupancy is released; the record and background checks (30 seconds) remain. Permanent read/stream errors stop automatic subscriptions and expose a manual status check.
- Existing concurrent composer submission remains in use. #152's stopped-run history hydration is retained. No server protocol, migration, dependency manifest or lockfile was changed.

## Authored browser coverage

`e2e/web/connection-recovery.e2e.ts` was started before production edits. It uses `tester-army/e2e` 0.17.0 and official `@e2e-dev/web` 0.12.0, with no direct Playwright import or browser route fulfillment. The pre-acceptance case only aborts real requests through the official engine; it supplies no substitute response.

The 15 cases cover boot failure with backoff/online/WS hello/IM wake-ups, accepted response loss, accepted sequence zero, permanent 401/403/404 send errors with explicit manual retry, rapid A → B → A, SSE cut, silent SSE terminal loss, service outage with bounded local waiting, rapid logout/sign-in, and a pre-acceptance network abort followed by another composer send. Assertions inspect actual authoritative IM row counts, original-nonce row counts, accept attempts, drain concurrency, attachment counts, retained composer text, active run occupancy, durable lifecycle and work item counts by tenant/trigger/agent. Evidence hashes the nonce instead of exposing it. Screenshots/video are requested by the commands below.

The isolated fixture supplies test login identity and a realtime hello socket. API and model worker run in separate processes, and the child receives only fixed synthetic fixture configuration. Ordinary product HTTP routes, tenant/project permissions, PostgreSQL, real pinned WuKongIM, and LingxiOS own the tested state. Faults are injected in a loopback HTTP proxy. Attachment bytes use the established integration storage provider; this does **not** validate browser upload/S3 behavior. The model provider deliberately does not answer, so the remote run ends through a real persisted failure; live successful LLM completion/result delivery is **not** covered.

## Actual validation and blocker

The initial frozen installation returned E401. On the next authorized environment turn, the **same existing npm configuration** read official 3.4.7 registry metadata successfully, with the exact locked tarball URL and SHA-512. A normal frozen retry succeeded: **1458 packages installed, exit 0**, and installed LingxiOS reports **3.4.7**. No manifests, lockfile, migrations, credentials, registry, authorization rules or integrity checks were changed. No source-built dependency was installed.

Validation so far on the corrected implementation:

- `npm run lint`, `npm run typecheck`, `npm run build`: **exit 0** (build also performs typecheck). Lint has only the 2 pre-existing warnings and 2 informational findings in untouched files; build retains existing CSS/chunk warnings.
- Web tests plus the owning error/history/transport tests: **90/90 passed, no skips**. Existing mocks now implement connection listeners/browser timers and hold an active SSE until cancellation; original behavioral assertions remain. The transport fixture also expects the current public native answer annotation.
- `npm run test:e2e:typecheck`, both fixture `node --check` commands, and `git diff --check`: **exit 0**.
- Initial PR CI on `e334dce544dc85a15045ca2416bdf5867525273c`: **checks (web) passed**; integration/deploy/publish/rollout skipped by scope.
- The first frozen browser run exposed three fixture statistics failures (`run_id` is not the work-table key). Fixed the query to count all work for the original tenant/trigger/agent and assert actual IM rows rather than only distinct nonces. Explicit EOF and swallowed-frame faults are separate. Worker shutdown no longer stops the API control plane.
- Corrected targeted SSE run: **3/3 passed**, including a 60-second outage where local occupancy was released while the authoritative lifecycle remained `queued`, then recovered to the real persisted `failed` terminal state. The silent stream opened once and recovered via the snapshot endpoint.
- Additional regression run: **2/2 passed** (pre-acceptance network abort and rapid logout/sign-in). Before removing the deferred logout disconnect, the latter failed with an outbox count of 1 after service restoration.
- Final complete 15-case browser run on the updated source is pending; no final browser acceptance is claimed yet.

A separate optional static-render component test is blocked by the repository's bare Node CSS loader (`ERR_UNKNOWN_FILE_EXTENSION` for the existing forum editor CSS). The exact same failure was reproduced in an isolated worktree at the unchanged main baseline with the same frozen dependency install. It is not counted as passing; actual chat UI is exercised in the browser cases above.

## Re-run

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
E2E_CONNECTION_RECOVERY=1 E2E_RECOVERY_EVIDENCE_DIR=.e2e/issue160-final/counts E2E_BASE_URL=http://127.0.0.1:5196 npm run test:e2e:web -- e2e/web/connection-recovery.e2e.ts --output .e2e/issue160-final --video on
```

In the selected cloud image, add `/workspace/.lingxi-setup/browser-local-images.yaml` to Compose to use the prepared pinned service images; use `XDG_CACHE_HOME=/workspace/.lingxi-setup/cache` for the prepared official browser. The fixture server binds only to loopback and inserts uniquely named synthetic records in `lingxiloop_integration_test`; it does not truncate a database. Do not run other integration fixtures against that database concurrently.

Retain `.e2e/issue160-final/report.json`, `junit.xml`, `summary.md`, `run-metadata.json`, screenshots and video. Raw browser traces may contain synthetic authentication material and must remain ignored. Publish only reviewed screenshots and counts with nonce values omitted or hashed.

## Not accepted yet

- Complete single-run verification of all 15 browser cases on the final source, reviewed screenshots/recordings, and updated CI.
- Joint validation with #154's server receipt reconciliation, including historical invalid cached receipts and real successful result/delivery recovery.
- Real authentication/session expiry, upload/S3 recovery, browser-generated offline/online transitions, separate project-only revocation flows, multi-tab recovery and live model completion.
- Astra review/integration. This change must remain a draft; no merge or deployment was performed.
