# Issue 193 independent acceptance

Baseline: LingxiLoop `b2013edc`; ZCode `0a1fc56d279fd1001f78387bd81aec1c26767411`.
Test design authored before the visualize host implementation. No result below is a pass until a generated report and its raw artifacts exist.

## Failure model and gates

| Boundary | Failure to catch | Required evidence |
| --- | --- | --- |
| Vendoring | missing file, changed bytes, missing external Tweak runtime/license | 24-file inventory and SHA-256; runtime/vendor manifest verification |
| Source parity | simplified card, dialog, controls, tokens or wrong fonts | original upstream source and product source rendered with one fixture; screenshots and pixel diff |
| Document | executed before complete reply, broken relative assets, wrong sizing | ready transition; measured height; exact CDN resources served offline |
| Controls | edits not reflected, wrong groups/range/color/toggle/select, reset/original destructive, submit without intent | browser input actions plus fixture output and follow-up count |
| Variants | replacing DOM loses per-variant interaction | switch away/back and read distinct counters |
| State | save ACK before durable write, cross-session leakage, replay overwrites new state | reload/session switch/expand-collapse; real PostgreSQL integration |
| Lifecycle | stale page still active, disposal during request authorizes successor, capacity leak | revoke/retry and repeated page admission through real routes |
| Bridge | forged source/token/gesture can save, invoke tools or open links | negative browser and real route requests; no side effects |
| Authorization | cross-tenant/project/channel/file reads or updates | real authenticated route matrix; illegal traversal/symlink/resource path |
| Export | wrapper missing resources or still relies on model bridge | original render.py output opened with official browser; independent state interaction |
| Generation | canned fixture substituted for model output; missing state in continuation | separate real-model turn → file → completed reference → displayed widget → edit → follow-up transcript identifiers and ledger IDs |
| Retirement | old OpenUI active dependency/routes/messages | tracked-source search and build/type checks; immutable migration retained |

## Controlled visual protocol

Use one SHA-256-addressed HTML/JS fixture at `e2e/visualize/fixtures/acceptance.html`. Both upstream and product use viewport 1440×960, DPR 1, zh-CN, UTC, identical locally bundled fonts and theme inputs, with independent upstream/product CSS compilation, reduced motion, no animations, fixed calendar date and deterministic input. Wait for fonts, ready phase, registered controls and two animation frames. Capture light/dark card, controls and expanded dialog, plus narrow 390×844. Record browser version, DPR, viewport, font and CSS hashes, source commit and fixture hash. Do not hide a difference by changing the baseline; any nonzero pixel result requires an explicit reviewed explanation.

Original source entry imports the pinned upstream card, TweakPanel, primitives and complete original styles.css. Product imports its globals.css and zcode.css independently; only the test shell dimensions/font/motion inputs are shared. Web platform adaptation is necessarily shared between entries and must be disclosed: this proves presentation parity, while browser-host semantics and authorization require independent route/interaction tests. It does not claim a native Electron screenshot.

## Execution ownership

- Official engine only: `@e2e-dev/web` with `e2e` runner; no direct Playwright import or run.
- Isolated fixture port 5193; real API 5194, product Web 5195, worker health 5196.
- Parent owns dependency installation, isolated databases/infrastructure and live provider configuration. Existing soak processes and branches are excluded.
- Run commands and report status will be added as executable entrypoints become available. Missing mandatory gates cause acceptance failure, never a silent skip.

## Reproduction commands

Run from repository root with Node 22 and the existing official browser cache:

```bash
export PATH=/workspace/.tools/node-v22.23.3-linux-x64/bin:$PATH
export XDG_CACHE_HOME=/workspace/.lingxi-setup/cache
export E2E_TELEMETRY_DISABLED=1
node scripts/verify-zcode-visualize.mjs
node node_modules/e2e/dist/cli/bin.js run --config e2e.visualize.config.ts --output .e2e/visualize
node e2e/visualize/collect-evidence.mjs .e2e/visualize docs/evidence/issue-193/browser
```

The fixture server invokes the unchanged vendored render.py using `python3 -B` so verification does not add `__pycache__` inside the exact 24-file skill tree. `generated/manifest.json` records source and fixture hashes. The screenshot comparator accepts an array of `{name,upstream,product}` absolute or repository-relative PNG paths:

```bash
python3 e2e/visualize/compare.py .e2e/visualize/pairs.json --output docs/evidence/issue-193/diff
```

The final Web presentation and focused remaining checks use separate configs (single worker, no automatic retries):

```bash
E2E_VISUALIZE_OUTPUT=.e2e/visualize-web-final node node_modules/e2e/dist/cli/bin.js run --config e2e.visualize-presentation.config.ts --output .e2e/visualize-web-final
E2E_VISUALIZE_OUTPUT=.e2e/visualize-functional-final node node_modules/e2e/dist/cli/bin.js run --config e2e.visualize-final-functional.config.ts --grep 'native write|stale page|page capacity' --output .e2e/visualize-functional-final
```

The official public `E2EConfig.actionTimeout` and `tap({timeout})` are 90 seconds for the final checks. Earlier failures showed that pre-action observation consumed the default 30-second budget before native pointer dispatch; raising the action deadline preserves all official actionability and trusted-click checks. The capacity setup batches ordinary clicks on the public fixture page-selector button to avoid re-snapshotting all retained frames at every admission; it does not call private host APIs or manufacture guest trust. It must observe 64 active pages with zero closed pages before the 65th admission, preventing a TTL cleanup from masquerading as capacity evidence.

The live entry is separate and never substitutes fixture HTML for generated content. The server-owned `visualize-live.test.ts` starts the real API/worker and calls `node e2e/visualize/run-live-browser.mjs`; it requires the dedicated isolated live database and explicitly injected real model credentials. Browser-only invocation requires that live server already exists on port 5194. Its Web port is 5195. Reports go to `.e2e/visualize-live` or `E2E_VISUALIZE_LIVE_OUTPUT`.

## Final evidence status

| Evidence | Result and limits |
| --- | --- |
| `export/report.json` | PASS: original render.py standalone export; real browser increments/reloads state, bundled D3 and calendar run while external HTTP(S) is blocked. |
| `light-initial` | 2/2 full light interactions passed. Pixel comparison failed and is retained as the initial styling defect evidence. |
| `recheck-initial` | 7/13 passed: original upstream light/dark full interactions, standalone export, variants/D3/calendar/mobile, session/theme, acquisition retry, and synthetic/unsupported bridge rejection plus a real click. Six original failures remain preserved. |
| `product-pre-theme-correction` | Fresh product light/dark full interaction cases passed (2/2). Includes all parameter controls, groups, original preview, reset, submission, height, keyboard toolbar, expand/collapse, saved state/reload. Six screenshots matched the then-current independent baseline exactly; that baseline omitted the original Web entry theme/font inputs, so these zero diffs are **not final presentation acceptance**. |
| `lifecycle-first-correction` | Offline→online recovery passed. Stale case reached revoked/error state but incorrectly expected removal of an empty outer relay shell; author content was already unloaded. Capacity failed on its first official click before admission (30s action budget consumed), so capacity was not tested. |
| `clipboard-blocked` | Initial custom-provider startup failed before any CDP permission operation. Its truncated stderr did not establish the first fatal error. |
| `clipboard-environment-blocked` | Full stderr after per-profile XDG/cache/crash directory correction identifies `No usable sandbox`. The sandbox-on custom-provider route was stopped; no sandbox relaxation, page action, or permission grant occurred. |
| `web-final` | **PASS 4/4 scenarios; six of six screenshot pairs have exactly zero differing RGBA pixels** at 1440×960/DPR1. Independent immutable upstream CSS versus product CSS, original `applyTheme`/Zai/Web font/foreground/colorScheme and equal outer canvas; card, default controls and dialog captured through official UI actions. Both dark controls screenshots manually reviewed for readable foreground/native controls. |
| `functional-final` | **1 PASS / 2 FAIL**: revocation/retry/replacement/close passed (101.01s). Native-write observer captured one real call and original rejected promise: `Write permission denied` (59.11s); no PNG or OS readback pass. Capacity failed at page index 41 readiness (323.19s); indices 0..40 reached ready, 64→65 boundary was never reached. See capacity diagnostic and original trace. |
| Actual-model generation/continuation/export | **NOT PASSED.** Runtime-owned real GLM attempts failed before producing HTML; no live browser or actual-model export acceptance artifact exists. Scripted real-worker integration is separate evidence and does not replace this gate. |

The retained earlier baseline used only `.dark` and system font inputs. The correction uses immutable `packages/ui/src/useTheme.ts` plus `packages/web/index.html` semantics (no bootstrap snapshot), including `theme-zai-light/dark`, native control color scheme, semantic foreground, and Inter Web font. The product applies those original tokens only in its visualize scope; the original side compiles complete upstream styles independently. Both use the same bundled font files, viewport, DPR and fixed HTML/JS bytes. The final presentation captures default controls without repeating previously passed parameter/state behavior.

The actual-model standalone export entry `node e2e/visualize/run-live-export.mjs` reads `E2E_VISUALIZE_LIVE_OUTPUT/quantity-export.html`, serves only those delivered bytes on localhost:5198, blocks external requests, changes quantity and checks reload persistence. It is prepared but has no successful actual-model input. Isolated navigation PoC and deterministic fixture API are not substitutes for real backend authorization or model acceptance.

## Clipboard permission boundary

The unprivileged default-browser run preserves a real `navigator.clipboard.read()` permission denial (native write outcome was not established by that failed read) in `.e2e/visualize-recheck`. The dedicated `e2e.visualize-clipboard.config.ts` uses the official `@e2e-dev/web@0.12.0` public `BrowserProvider` contract (`dist/provider.d.ts`: attempt-scoped `acquire`/`release`, lease CDP endpoint). `e2e/visualize/clipboard-provider.ts` launches a disposable local Chromium profile from the existing official cache and uses Node's native WebSocket only for CDP `Browser.grantPermissions` / `Browser.resetPermissions`. The grant applies only to `http://127.0.0.1:5193`, with `clipboardReadWrite` and `clipboardSanitizedWrite`; no product or production setting is changed. Cleanup resets permissions, stops that leased process, and removes its profile. No `surfaceOf` or direct Playwright API is used. All navigation, input, PNG readback and screenshots remain official engine operations, without clipboard stubs.

```bash
node node_modules/e2e/dist/cli/bin.js run --config e2e.visualize-clipboard.config.ts --grep copy-image --output .e2e/visualize-clipboard
```

This custom-provider entry is environment-blocked before permission setup by Chromium's `No usable sandbox` fatal error. Full stderr is retained; no disabling flags were added and this path will not be retried here.

`clipboard-write.e2e.ts` is a narrower diagnostic using the ordinary official engine. Its init script binds and calls the original native `navigator.clipboard.write` with the original ClipboardItems, returns the exact original promise, and records PNG bytes only after that promise fulfills. Rejection remains rejection. It never stubs success or grants permissions. The recorded PNG is the item supplied to the native write, **not OS clipboard readback**; the initial native read denial remains an explicit limitation.

The final ordinary-engine native-write observation returned `native-rejected`, one call, `NotAllowedError: Write permission denied`. Unlike the earlier read-only denial, this establishes failure of the write itself in this test environment. It was not converted to success; no PNG was asserted or generated as clipboard evidence. Further permission attempts were stopped.

Capacity diagnosis: 42 page creates returned HTTP 200; the page-41 snapshot progressed from loading to generic error UI. No HTTP error or console warning/error was recorded. Delayed initialization is consistent with the adapter handshake deadline, but the actual error object was not retained, so the unique cause remains unknown. Browser capacity 64/65 and restoration after eviction are explicitly unverified; backend tests cannot substitute. No further browser attempts were made.
