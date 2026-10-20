# PR220 normal-completion test ordering correction

Root requested diagnosis and a minimal verified test-only patch. Product source is untouched. `source-proof.json` confirms all 802 production source files equal root's combined candidate working tree based on 49c26d99, including root's new Visualize original activity identity fix. The candidate/author branches were not modified by this reviewer.

## What the original failure proves

Original combined official engine run: 13 passed / 2 failed / 15 unique cases. The normal-completion case returned total1262/samples[]/caret1. Its native trace `call@79` after-snapshot is still message=running/part=running (timestamp23589.718). Only the later call@85 before-snapshot shows both complete (timestamp24175.742). `original-failure-trace-extract.json` retains these exact fields plus the original trace path and SHA-256.

Thus the completion assertion ran before the requested terminal state committed. This is stronger evidence than attributing the result to load. The old test also waited a nominal70ms without establishing that the new target had been received or was still partially displayed. No product normal-completion regression is established by that receipt. The original full trace remains untouched in root's artifacts.

## Patch

Apply `completion-test-only.patch` to root's current candidate; `git apply --check` succeeded. Only these files change:

- scripts/streaming-lifecycle-check.tsx: expose the raw public Text part's received length using a primitive useAuiState selector. For an explicitly selected test input only, use public ReactDOM flushSync to commit its state before another animation frame; all existing unsynchronized inputs retain their behavior.
- e2e/web/streaming-lifecycle.e2e.ts: before sending complete, a MutationObserver captures actual message=running, received=target, and 0<visible<target on the committed DOM. It immediately sends the selected synchronous complete input. The test then explicitly waits for actual message=complete and collects a nonempty post-complete sample sequence, including the initial sample before yielding another frame.

Assertions retain pending precondition, partial post-complete prefix, full exact body, zero final caret, and static replaced history. They additionally require every sample's actual complete status and full received target, and monotonic visible lengths. The original five-second internal completion limit now covers precondition plus completion rather than being expanded. No tolerance/timeout increase, retry, dependency patch, fake smooth engine or product fixture substitution was introduced. Failure model was written before this test correction.

## Actual validation

One targeted official-engine execution after the correction, zero retries: **1 passed / 0 failed**, 6.80 s including startup/history verification. This was the first corrected run; it was not rerun until green. Receipt: `green.log`, `green/report.json`, JUnit and native trace/screenshots under `green/`.

- Before complete: received1262, visible2, message=running, caret1.
- Actual complete-state visible lengths: 17,17,176,176,415,581,908,1100,1226,1260,1262.
- Every sample has message=complete and received1262; final exact body=true, caret0.
- Existing replacement/history assertions passed in the same case.
- `node node_modules/typescript/bin/tsc -p e2e/tsconfig.json`: exit0 (test typecheck). No full build/typecheck claimed for this isolated directory.

Run command (fixture server separately uses `node node_modules/vite/bin/vite.js --config vite.config.ts`):

```sh
source /workspace/.lingxi-production/env.sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/.lingxi-setup/cache/ms-playwright \
E2E_TELEMETRY_DISABLED=1 E2E_STREAMING_FIXTURE=1 \
node node_modules/e2e/dist/cli/bin.js run --config e2e.config.ts --grep 'normal completion' --trace on
```

Node22.23.3, e2e0.17.0/@e2e-dev/web0.12.0, official default engine, existing cache, no direct Playwright or TLS/sandbox changes. Root owns the final combined 15-case run and exact-head CI.

## Separate Chinese transition observation

Root's current working test already changed the second `await step(mixedText)` into dispatch-and-sample, matching the concrete problem in the original failure: awaiting complete text arrival before collecting colors can skip the 700ms transition. Preserve the >3 actual color samples, before!=end, identity, target-arrival and stable-paragraph assertions. If a further failure occurs, capture transition-start (`transitionrun` or the old word's data-streaming-fresh change) and RAF timestamps rather than raising the timeout, weakening color counts or claiming an environment cause. I did not run or modify that separate test.

No production action, publication, merge or remote push occurred. The isolated fixture server was stopped after verification.
