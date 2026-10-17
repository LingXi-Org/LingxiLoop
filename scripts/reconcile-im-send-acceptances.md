# Issue #154: receipt reconciliation

The repair command inspects persisted acceptances against authoritative WuKong
history. It never sends IM messages, runs a model/action, upserts membership,
changes a result/message key, resets a run, or resumes a worker. Run it with the
normal server configuration supplied by the operator; do not put credentials in
arguments, reports or source files.

```sh
# Read-only: one tenant/sender, at most 100 records by default.
npx --no-install tsx scripts/reconcile-im-send-acceptances.ts --company COMPANY --sender SENDER

# Read-only: inspect the exact original nonce before applying.
npx --no-install tsx scripts/reconcile-im-send-acceptances.ts --company COMPANY --sender SENDER --nonce ORIGINAL_NONCE

# Apply only that inspected record; require the explicit target database name.
npx --no-install tsx scripts/reconcile-im-send-acceptances.ts --company COMPANY --sender SENDER --nonce ORIGINAL_NONCE --apply --database EXACT_DATABASE_NAME
```

Inspection is the default. Use `--after ORIGINAL_NONCE --limit 100` to page the
ordered sender scope; output contains nonce hashes and classifications, never
message content. `mayHaveMore` means another page may be needed. Applying is
idempotent and serialized by the original tenant/sender/nonce lock. It fixes only
the acceptance; the ordinary runtime delivery retry then acknowledges the
original result. A terminally failed runtime outbox still needs its existing,
separately authorized retry flow. This script does not initiate it.

| Classification | Evidence and action |
| --- | --- |
| `confirmed` | Valid stored receipt, or exactly one authoritative nonce match with the original sender/channel/type/payload digest, positive safe sequence, and matching known message ID. `--apply` repairs the same acceptance. |
| `not_executed` | A new-version `send-not-dispatched-v1` marker with no receipt proves dispatch has not started. Inspection/apply do not dispatch it. |
| `unknown` | Legacy pending state, absent/invalid/ambiguous history, mismatched known ID or immutable payload, or an incomplete scan. Keep pending; never resend on absence alone. |
| `forbidden` | Current membership, original principal/project access, persisted run identity, or frozen audience is denied. No repair or redispatch. |
| `not_found` | No acceptance exists for the exact scoped key. |

Only an actual shared `ForbiddenError` is classified as a permission denial.
Known missing run/principal/audience facts raise that type explicitly. SQL,
connection, TypeError, and other unexpected callback/history failures instead
raise `ImSendReconciliationError` (`im_reconciliation_unavailable`) with a fixed
safe message and the original non-enumerable `cause`. They do not change the
acceptance or print private diagnostics. The CLI exits unsuccessfully; rerun
after the dependency/code failure is resolved. Shared permission resolution
must preserve its own infrastructure exceptions, as required by #159; this PR
does not change that resolver or `nativeTool.authorize`.

Assistant/system maintenance requires a stored protocol-v2 run binding and its
original persisted frozen audience. Missing legacy authority evidence stays
blocked for operator review. If an old cached numeric message ID was already
rounded by JavaScript, an incompatible exact history ID remains `unknown` rather
than guessing a replacement. New responses retain the exact int64 token using
Node 22's JSON source context. WuKong history legitimately permits timestamp 0.

The existing status response keeps `status`, `echo`, `error`, `channelId` and
`updatedAt`. Invalid accepted receipts project as `pending`, `echo: null`, with
`delivery-reconciliation-required`. Unknown retries return HTTP 503 with
“结果已保存，投递待恢复”. The first recovery lookup is immediate; unsuccessful
lookups persist a 5-second minimum retry interval. Each scan is bounded to 15
seconds/100 pages, without membership repair. Runtime retry limits remain owned
by LingxiOS. Production recovery controls and joint UI verification belong to
#160.

## Repeatable verification

Use Node 22.13+ and the frozen dependencies. The desktop binary is not needed:

```sh
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --cache /tmp/lingxiloop-154-npm-cache --no-audit --no-fund
docker compose -p lingxiloop-e2e -f e2e/server/compose.yaml -f e2e/browser.compose.yaml up -d --wait postgres redis wukongim
npm run test:e2e:install
node scripts/test-im-send-reconciliation.mjs --browser --regression
npm run server:lint
npm run server:typecheck
npm run server:test
npm run test:e2e:typecheck
```

The dedicated runner creates only `lingxiloop_im_reconciliation_test` on the
loopback fixture PostgreSQL and uses Redis DB 3. It strips ambient product/model
credentials, disables external providers and executes only new synthetic work.
WuKong must be the pinned `c7f663fa23a4ee2c6f7e08c68423f50f0f6e9c47` fixture on
55001/55200. An existing local image may be selected with `E2E_WUKONG_IMAGE` when
starting Compose. Official browser cache/CDP configuration may be supplied via
`XDG_CACHE_HOME`/`E2E_CDP_URL`.

Evidence is written to `.e2e/issue-154/`: `validation.json`, `integration.log`,
`real-wukong.json`, `runtime-recovery.json` and official browser
`browser/report.json`, `browser/junit.xml`, screenshots and `run-metadata.json`.
The runtime check simulates 12 failed outbox attempts on a new synthetic run,
repairs its original acceptance with the maintenance authorization guard, and
uses the existing authorized terminal-delivery retry API. It verifies the
original resultId/messageKey, one WuKong send/message, and unchanged
model/action/budget counts after recovery. The browser
uses real PostgreSQL/WuKong and existing HTTP endpoints with isolated test auth;
it verifies status compatibility, concurrent recovery, tenant denial, unknown
503 and a successful new human message. It is not production frontend recovery
UI acceptance. Real model-provider execution, production data repair and a
24-hour soak are not performed by this runner.

## Joint check with #160

The #154 branch was combined in a disposable detached worktree with PR #165
head `e334dce544dc85a15045ca2416bdf5867525273c`, using frozen LingxiOS 3.4.7.
Web and E2E typechecks passed. The two receipt-related official browser cases
passed against the real PostgreSQL/WuKong fixture and production chat components:

```sh
node --import tsx e2e/connection-recovery-server.mjs
# Separate terminal in that combined worktree:
LINGXILOOP_DEV_API_TARGET=http://127.0.0.1:5199 LINGXILOOP_DEV_WS_TARGET=ws://127.0.0.1:5199 npx --no-install vite --host 127.0.0.1 --port 5196 --strictPort
# Separate terminal:
E2E_CONNECTION_RECOVERY=1 E2E_BASE_URL=http://127.0.0.1:5196 E2E_TELEMETRY_DISABLED=1 node e2e/web/run.mjs e2e/web/connection-recovery.e2e.ts --grep 'accepted (response loss|sequence zero)' --output .e2e/issue-154-160 --video on
```

These cases verify lost acceptance response recovery/new sending and retention
of invalid sequence-zero echoes until reconciliation, with one message per
original nonce. The other 11 cases in #160's suite were not run here. The #160
proxy corrupts the response receipt; #154's separate real-WuKong/runtime checks
also corrupt the persisted acceptance and verify original result acknowledgement.
Reports, screenshots and videos remain in the disposable combined worktree's
`.e2e/issue-154-160/`. No #160 source files are included in this PR.
