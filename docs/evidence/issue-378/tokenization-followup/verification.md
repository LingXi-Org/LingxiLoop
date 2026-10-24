# Follow-up build and single browser replay

Base: PR #427, `2cb8961a87cb70750072182bb560b86386884a29`.
This increment keeps its original source-backed ranges and cache cleanup.

The already restored exact dependency lock and CI-aligned Node 22.23.3 were
reused. No dependency, authentication, security or network configuration was
changed. The task-owned Chromium 154.0.8037.57 used the previously approved host
launch with its own sandbox enabled and localhost CDP 9337. Only synthetic
public text was used; no product data, provider or production operation ran.

## Checks actually run

- The existing `npm run build` completed successfully, including Visualize
  verification/runtime prebuild, web/node TypeScript and the full Vite production
  build. Vite transformed 16,222 modules and completed in 1m 9s with a 6144 MiB
  heap limit. Existing pure-annotation/large-chunk warnings were not suppressed.
- The existing production budget fixture built in 42.91s with a 4096 MiB heap.
- The changed browser test passed its single-file strict TypeScript check and
  Biome lint. Product/source regression results are in `implementation.md`.
- The existing official `e2e` 0.17.0 / `@e2e-dev/web` 0.12.0 budget scenario ran
  once and passed **1/1**, run `01a16ebd-a1ed-7620-98b6-93eaeaf27555` (case 4.65s,
  total 7.08s). There were no retries or expanded browser/history matrix.

All existing behavior assertions are unchanged: 10,204 exact final characters,
128 active word wrappers, two fresh words, a 30-character selection preserved
through append, no final caret and zero settled wrappers. The screenshot was
inspected and is retained beside the official raw report. The source, lock,
fixture and built HTML digests are recorded in `browser-inventory.json`; the
report accurately records the dirty candidate state used for that build.

The only browser-test addition records Long Task durations and rAF intervals
inside the existing synthetic update/selection/completion window, after page
startup. It changes no behavior assertion or performance threshold. This sample
reported **zero Long Task entries**, **134 frame samples**, and a **50.1ms maximum
rAF interval**. There was no matched baseline timing run, CPU stack attribution,
heap snapshot, clipboard-write check, or real-device/population measurement.
These observations neither establish a causal whole-page speedup nor resolve
the long-conversation performance requirements of #378.

```sh
PATH=/workspace/.tools/node-v22.23.3-linux-x64/bin:$PATH NODE_OPTIONS=--max-old-space-size=6144 npm run build
PATH=/workspace/.tools/node-v22.23.3-linux-x64/bin:$PATH NODE_OPTIONS=--max-old-space-size=4096 node node_modules/vite/bin/vite.js build --config e2e.streaming-budget.vite.config.ts
PATH=/workspace/.tools/node-v22.23.3-linux-x64/bin:$PATH E2E_STREAMING_FIXTURE=1 E2E_CDP_URL=http://127.0.0.1:9337 E2E_TELEMETRY_DISABLED=1 node node_modules/e2e/dist/cli/bin.js run --config e2e.streaming-budget.config.ts --output .e2e/streaming-tokenization-browser
/workspace/.tools/node-v22.23.3-linux-x64/bin/node node_modules/typescript/bin/tsc --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck --noEmit --types node e2e/web/streaming-budget.e2e.ts
node node_modules/@biomejs/biome/bin/biome lint e2e/web/streaming-budget.e2e.ts
```
