# #378 remaining renderer work: environment and verification

Base: `11dd55d0f166e060369de323b7c1333447876f45`.
Branch: `perf/378-render-tail-followup`.

The current issue claims and open pull requests were checked before development.
The already merged mention fast path, incremental tokenizer, official
assistant-ui 0.15.31 viewport, historical avatars and narrow subscriptions are
retained. This task does not alter Visualize resource loading or deploy anything.

## Environment preparation

The fresh workspace's preinstalled packages did not match the current lock:
assistant-ui/react was 0.15.16 instead of 0.15.31, react-streamdown was 0.3.12
instead of 0.3.14, react-markdown was 0.14.13 instead of 0.14.15, and LingxiOS was
3.5.2 instead of 3.8.12. `npm ci --ignore-scripts --no-audit --no-fund` first
failed with HTTP 401 while downloading the exact locked LingxiOS package. One
retry with the same existing identity and same registry URL succeeded (1517
packages, 43 seconds). No credential was read, replaced or printed. Installed
package versions were then compared against the lock with no mismatches;
manifest and lock files are unchanged.

The first full build's typecheck then exposed a second preinstalled dependency
tree under `server/node_modules`, still containing LingxiOS 3.5.2. That directory
was moved to `/tmp/lingxi378-server-node_modules-preinstalled`, allowing the
existing resolution to use the restored root dependency. No product source or
lock was changed to hide the missing-export errors.

The first system Chromium launch inside the command sandbox aborted because
the SUID helper's root ownership was mapped to `nobody`. The same Chromium was
then launched outside that command sandbox through approved execution, keeping
Chromium's own sandbox enabled. No file permissions, network policy, browser
security configuration, or sandbox-disabling flag was changed. It reports
Chrome 154.0.8037.57 over localhost CDP 9337. Verification uses the repository's
official `e2e` 0.17.0 / `@e2e-dev/web` 0.12.0 engine.

Source checks use CI-aligned Node 22.23.3. Only synthetic public text is used;
there are no real conversations, provider calls or production writes.

## Verification results

After removing the stale shadowing dependency tree, `npm run build` completed
successfully with CI-aligned Node 22.23.3 and a 6144 MiB heap limit. Its existing
Visualize verification/runtime prebuild, web/node TypeScript checks and full
production Vite build all passed; Vite transformed 16,223 modules and finished
in 51.71 seconds. Existing package pure-annotation and large-chunk warnings
remain, with no thresholds changed.

The existing production fixture built successfully in 33.02 seconds. The
unchanged official budget scenario passed **1/1** in run
`01a16eab-f447-790d-ade7-48694e80def6` (case 4.34 seconds, total 6.47 seconds):

- 10,204 exact final characters, 128 animated word wrappers and two fresh words.
- The 30-character selected range retained its exact text after append.
- The caret disappeared on completion and settled wrappers reached zero.
- The final screenshot was inspected; the raw report and screenshot are retained
  beside this file. Source and fixture digests are in `browser-inventory.json`.

The report correctly records a dirty candidate at the base commit; the inventory
identifies the actual source used. The first CLI attempt used an incorrect
binary filename and exited before running any case; it was corrected to the
package's declared `dist/cli/bin.js`, then the single scenario above ran once.

```sh
PATH=/workspace/.tools/node-v22.23.3-linux-x64/bin:$PATH NODE_OPTIONS=--max-old-space-size=4096 node node_modules/vite/bin/vite.js build --config e2e.streaming-budget.vite.config.ts
PATH=/workspace/.tools/node-v22.23.3-linux-x64/bin:$PATH E2E_STREAMING_FIXTURE=1 E2E_CDP_URL=http://127.0.0.1:9337 E2E_TELEMETRY_DISABLED=1 node node_modules/e2e/dist/cli/bin.js run --config e2e.streaming-budget.config.ts
```

The scenario checks DOM selection, complete text and wrapper cleanup; it does
not measure clipboard writes, receive-to-paint latency, frame rate or net heap.
Operation counts, synthetic timing and behavior checks do not establish
real-device frame rates or complete #378 acceptance. The issue remains open.
