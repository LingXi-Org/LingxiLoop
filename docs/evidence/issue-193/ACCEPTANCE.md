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

The live entry is separate and never substitutes fixture HTML for generated content. The server-owned `visualize-live.test.ts` starts the real API/worker and calls `node e2e/visualize/run-live-browser.mjs`; it requires the dedicated isolated live database and explicitly injected real model credentials. Browser-only invocation requires that live server already exists on port 5194. Its Web port is 5195. Reports go to `.e2e/visualize-live` or `E2E_VISUALIZE_LIVE_OUTPUT`.

## Evidence status

- `export/report.json`: official runner 0.17.0 / web engine 0.12.0, standalone export scenario passed. `export/export.html` is the independently runnable original-render.py output; `export/screenshots` contains its captured result. External HTTP(S) resource requests were denied for this run; bundled D3/calendar and state reload succeeded.
- Presentation and live model reports are not yet acceptance passes; their final results must be attached before closing the issue.
- Isolated navigation PoC observations are not a substitute for production bridge authorization coverage. No complete security acceptance is claimed here.
