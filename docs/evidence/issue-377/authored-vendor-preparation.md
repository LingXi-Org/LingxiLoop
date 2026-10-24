# Authored vendor preparation

Refs #377. Baseline: main `11dd55d0f166e060369de323b7c1333447876f45`.
This follow-up removes one remaining resource dependency wait. It does not close
the full loading issue or establish a production latency percentile.

## Evidence and change

`buildWebDocument` already starts the pinned kit's three fixed dependencies
alongside its HTML and overlaps resource preparation with the authorized fresh
state read. However, even when the authored fragment explicitly imports the
allowlisted D3 URL, D3 previously started only after `visualize.html` returned.
That adds a kit-response wait to a dependency already known from the fragment.

The existing early-read set now includes vendors declared by the fragment, for
both known and unknown kit versions. It still uses the same page-local promise
map, resource reader and failure boundary. Unknown kit-only dependencies still
wait for actual HTML discovery. No additional dependency, cache, authorization
path or lifecycle owner was added. Source-message admission, fresh state,
capability isolation, CSP, opaque iframes and script execution order are unchanged.

Before implementation, the narrow target was to remove the kit-to-D3 request
barrier, preserve resource counts and complete HTML bytes, and exercise the
existing real guest control. With 120 ms injected for each of kit and D3, the
expected resource-path saving is roughly one 120 ms wait, subject to other work.
This is not a new absolute budget or acceptance claim for all #377 scenarios.

## Focused checks

The regression holds the kit response pending. Baseline: 2 passed, 3 failed
(pinned/authored D3, unknown-kit/authored vendors, authored failure propagation).
After the change: all 5 passed. It also checks no duplicate or unrelated reads,
calendar demand and script order. Three temporary old-function/new-function
comparisons produced byte-identical complete documents for pinned, pinned with
authored vendors, and unknown kit with authored vendors/calendar.

```sh
node --import tsx --experimental-test-module-mocks --test --test-force-exit --test-concurrency=1 src/features/chat/visualize/web/document-preparation.test.ts
node --import tsx --experimental-test-module-mocks --test --test-force-exit src/features/chat/visualize/web/host-preparation.test.ts src/features/chat/visualize/web/public-resource-cache.test.ts
```

The adjacent host/cache checks passed 10/10, including authorized state gating,
cancellation, cleanup, account changes, revision ordering and completed public
byte reuse. Scoped Biome lint passed for all three changed TypeScript files;
`git diff --check` passed. The existing first-card assertion now distinguishes
authored D3 from dependencies discovered from an unknown kit. That separate
first-card browser test was not rerun; the startup fixture below was used.

## Controlled browser observation

Node 24.19.0, Chromium 153, official `@e2e-dev/web` engine, 1440×960, zh-CN, UTC.
The existing `startup.e2e.ts` and authored acceptance fixture ran once per
variant, three samples each, before as a batch then after as a batch. The local
wrapper substitutes only baseline `document.ts` for the before run. Kit and D3
each receive 120 ms fixture delay; other resource delays remain zero. Each
sample reloads the page. This legacy fixture omits public resource hashes, so
the browser comparison exercises unknown-kit discovery; pinned-kit behavior
is covered by the focused tests above.

Raw timings are milliseconds from the fixture's “进入 A” click, except the
D3 start gap, which is D3 request start minus kit request start:

| Sample | D3 start gap before → after | Iframe observed before → after | SDK ready before → after | Paint proxy before → after |
| --- | --- | --- | --- | --- |
| 1 | 128.4 → 1.1 | 369.3 → 189.5 | 665.6 → 433.7 | 700.2 → 466.7 |
| 2 | 125.6 → 0.3 | 288.8 → 168.3 | 416.3 → 298.0 | 457.9 → 338.1 |
| 3 | 123.0 → 0.6 | 294.3 → 172.5 | 420.5 → 317.4 | 454.9 → 347.8 |

Every sample made one page-create request and eight fixed-resource requests,
and recorded one inner guest document creation. The actual `#fixture-play`
click succeeded in all six samples. Interaction latency was not measured.
The existing paint proxy requires an SDK size notification above 100 px,
visible iframe, ready state and two animation frames. It is not a direct SVG
visual scan or an independently timed first meaningful paint. The sample-1
pre-request and long-task differences also contribute to its larger reduction;
do not attribute that entire difference to this change. Three samples per
variant, run in batches, do not support production percentiles or a precise
percentage speedup.

Raw traces and runner configuration:
[before](authored-vendor/before/startup.json),
[after](authored-vendor/after/startup.json),
[runner](authored-vendor/runner.config.ts),
[server wrapper](authored-vendor/serve.mjs).

Each sample transferred the same eight fixed assets, 1,601,190 bytes including
HTTP overhead. [Summary](authored-vendor/summary.json) records source/runtime
hashes, environment and these counts. Other state/visibility request counts
varied with asynchronous fixture activity and are retained in the raw traces.

To reproduce this same narrow comparison from the repository root:

```sh
mkdir -p .e2e/377-vendor
cp docs/evidence/issue-377/authored-vendor/serve.mjs .e2e/377-vendor/serve.mjs
cp docs/evidence/issue-377/authored-vendor/runner.config.ts e2e.visualize-377-vendor.local.config.ts
git show 11dd55d0f166e060369de323b7c1333447876f45:src/features/chat/visualize/web/document.ts > /tmp/issue-377-document-before.ts
npm run build:visualize-runtime
PLAYWRIGHT_BROWSERS_PATH=/workspace/browser-cache E2E_TELEMETRY_DISABLED=1 E2E_VISUALIZE_OUTPUT=.e2e/377-vendor/before ISSUE377_DOCUMENT_SOURCE=/tmp/issue-377-document-before.ts npx --no-install e2e run --config e2e.visualize-377-vendor.local.config.ts
PLAYWRIGHT_BROWSERS_PATH=/workspace/browser-cache E2E_TELEMETRY_DISABLED=1 E2E_VISUALIZE_OUTPUT=.e2e/377-vendor/after npx --no-install e2e run --config e2e.visualize-377-vendor.local.config.ts
```

## Environment setup and build

The fresh cloud environment contained stale preinstalled dependencies:
assistant-ui 0.15.16 rather than locked 0.15.31, LingxiOS 3.5.2 rather than
locked 3.8.12, and no MCP Apps package. The first runtime build therefore failed
to resolve `@modelcontextprotocol/ext-apps`. Root `npm ci` downloaded the locked
packages but failed fetching the local-only Electron binary (`ECONNREFUSED`).
Using the existing CI setting `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci` completed
successfully without changing either manifest or lockfile.

The first full build then reached typechecking but found a separate stale
`server/node_modules/@lyyzka/lingxios` 3.5.2; the root was already 3.8.12.
[Initial build log](authored-vendor/web-build-initial.log) preserves that failure.
`npm ci --prefix server` restored the server's locked 3.8.12 package. No network
security setting, registry credential or dependency version was changed.

Official Chromium installation initially could not create its default cache
under `/home/agent`; it succeeded in `/workspace/browser-cache`. Two temporary
runner setup attempts failed before collecting any test: an incorrect relative
config import, then placing the config below the repository root. The retained
runner above corrects both; neither failure was a product performance sample.

After restoring both exact dependency installations, `npm run build` passed:
fixed-source verification, official guest bundle generation, Web TypeScript
checks and Vite production bundling (16,223 modules; Vite build 39.03 s).
The [complete successful log](authored-vendor/web-build-final.log) retains the
existing bundler annotation/chunk-size warnings. No deployment was attempted.

## Remaining boundary and rollback

No production request or student data was used. Model generation, save-to-source
delivery, real tenant authorization, retained-page return, multi-card pressure,
and production first meaningful paint remain unverified by this follow-up.
Lifecycle source inspection did not establish another reproducible rebuild
defect, so those owners were left intact. Keep #377 open for its unmet scenarios.
Reverting the early-read filter and matching assertions restores the original
schedule without a migration or persisted-state change.
