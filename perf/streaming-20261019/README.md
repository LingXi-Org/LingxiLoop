# Reproduce issue #202

Use the repository root and the exact committed root package lock. Do not leave a stale nested `server/node_modules`: it overrides root resolution and can silently load a different runtime. Cloud initialization had root and nested 3.5.2 installed despite main pinning 3.5.3; all initial smoke/`preinstalled-paired.json` files are exploratory and invalid for release conclusions. Their retention makes this exclusion auditable. The nested directory was moved outside the checkout. No locks, credentials, deployment or security configuration changed.

```sh
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --cache /workspace/.npm-cache --no-audit --no-fund
# Only the unsupported-for-release desktop binary download is skipped.
git worktree add --detach /workspace/LingxiLoop-perf-base 088e269f36f63884b44704c3b0f1e27f1a6f76fc
ln -s /workspace/LingxiLoop/node_modules /workspace/LingxiLoop-perf-base/node_modules
node perf/streaming-20261019/run.mjs /workspace/LingxiLoop-perf-base . perf/streaming-20261019/paired.json
node perf/streaming-20261019/check.mjs
npm run server:typecheck
npm run server:lint
npm run server:test
node e2e/server/run.mjs --file runtime-nonthinking.test.ts --file native-message-approvals.test.ts --file public-run-activity.test.ts
```

`run.mjs` alternates fresh A/B child processes, warms each once, explicitly collects before measurement and reports nearest-rank p50/p75/p95. It measures projection + wire encoder + client decoder/tracker, not just server CPU. Input bytes are prepared before the clock. All data is synthetic. HTTP requests and DB calls are zero because this is the protocol stage in isolation. Runtime version is recorded for every sample. Counter instrumentation runs separately from timing. RSS/heap peaks are sampled every 20 decoded chunks (not absolute process peaks); retained heap is measured after explicit GC outside timing. Short = 40 deltas/1,080 characters; long = 400 deltas/86,400 characters. Long is a stress case, not evidence of typical provider output length. Timing is evidence, not a portable CI threshold; deterministic state/wire/operation checks are the retained guard. No existing performance ceiling or test was loosened.

For actual browser rendering (official `@e2e-dev/web`, no direct Playwright), start these in separate terminals:

```sh
node node_modules/vite/bin/vite.js build --config perf/streaming-20261019/vite.config.ts
node node_modules/vite/bin/vite.js preview --config perf/streaming-20261019/vite.config.ts
node --import tsx perf/streaming-20261019/serve.ts /workspace/LingxiLoop-perf-base .
XDG_CACHE_HOME=/workspace/.lingxi-setup/cache XDG_CONFIG_HOME=/tmp/lingxi-perf-config E2E_TELEMETRY_DISABLED=1 node_modules/.bin/e2e run --config perf/streaming-20261019/browser.config.ts
```

This uses the same production-built fixture for both backends, real product decoder/store/native Markdown, one HTTP stream per sample, natural local network/CPU and a fresh browser context. It verifies the complete 1,080-character answer and real input; records first rendered message, first rendered body and final rendered state separately. Streaming can finish within one paint in this no-provider fixture; that does not imply real model TTFT. Output lives beside the config in `browser-results/`; official screenshots/report are under ignored `.output/`. No client UI code is modified by this PR.

Full product login/conversation baselines use the existing disposable local control/API/PG/Redis/WuKongIM services and `journeys.config.ts`. Start them using `e2e/server/compose.yaml`, `e2e/browser.compose.yaml`, `e2e/admin/start-control.mjs`, and `e2e/local-api.mjs`. Build the ordinary web app with `perf/bench/vite.config.ts` into `.e2e/perf-page`, proxy to local control `8797`, then preview on `5180`. The test mints and expires synthetic D1 sessions through the existing fixture; authentication, signed gateway and authorization still run. It does not test captcha, send a real model request, or represent production network p75. The seeded conversation is empty and fixed. `journey-results/` records native-CPU/network cold-context p50/p75/p95 inputs, workspace and conversation readiness and request counts; these are baseline-only because the web entry and route are unchanged.

```sh
XDG_CACHE_HOME=/workspace/.lingxi-setup/cache XDG_CONFIG_HOME=/tmp/lingxi-perf-config E2E_TELEMETRY_DISABLED=1 node_modules/.bin/e2e run --config perf/streaming-20261019/journeys.config.ts
```

Keep builds and other CPU-heavy checks out of timed sampling. The browser engine owns launching and actions. No production requests, model calls, fault injection, long soak or production deployment are part of these commands. Existing integration artifacts include synthetic tool/private-marker checks; never substitute real user messages.

The page preview must set BOTH `LINGXILOOP_DEV_API_TARGET=http://127.0.0.1:8797` and `LINGXILOOP_DEV_WS_TARGET=ws://127.0.0.1:5181`. The control Worker handles HTTP; WebSocket upgrades go directly to the local product API. Omitting the second value caused fixture-only EPIPE/reconnect requests; those samples were excluded and all 20 page journeys rerun after correction. Do not optimize production authentication from that artifact.

For the two viewport visual guard, set `PERF_WIDTH=390 PERF_RUNS=1` on the browser command. These two mobile samples are correctness evidence only. CPU diagnosis can be repeated with `PERF_CPU_PROFILE=/tmp/lingxi-perf.cpuprofile node --expose-gc --import tsx perf/streaming-20261019/sample.ts . long`; that profiled run is excluded from the timed A/B report. Run `node perf/streaming-20261019/summarize.mjs` to aggregate protocol, browser and product-baseline JSON.
