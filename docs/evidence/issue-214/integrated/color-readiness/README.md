# Color readiness test-only correction

The original combined run was 34/35. The failing case read foreground before append and again at the end, despite recording four colors and retaining its DOM node. Text arrival did not prove fresh-color readiness.

The corrected test waits on the same connected token until it is fresh and its computed color equals the existing caret's canonical blue background color. This shares the initial step's original 3000ms deadline. No production/fixture timing, browser flags, or test timeout changed. All original assertions remain; exact initial tail, blue color and final inherited foreground assertions were added.

One actual browser execution passed: **1/1, retries 0**, run `01a15763-3c55-750a-b7d1-d0ebbf3e940c`, total 4.01s. The test observed initial `[丙, 丁]`, canonical blue `oklch(0.623 0.214 259.815)`, 45 transition colors, final foreground `oklch(0.141 0.005 285.823)`, preserved node identity, zero stable-block mutations, final `[中, 文]`, and one caret. Initial blue readiness was recorded 59ms after dispatch; this execution arrived already blue, while the retained original failure proves the earlier foreground sampling race. The condition is checked before append in both cases. No test was repeated to obtain a passing result.

The exact test and config were copied to `/tmp/pr220-color-readiness-runner`, which reads the combined tree's existing installed dependencies and serves the already-running combined Vite fixture at port 5214. No dependencies were installed or modified. The official runner's first PR220 startup reported missing `picocolors`; no tests ran. The first private invocation used an outside-root output directory, which the runner rejected before running tests; corrected output stays inside the private project and its artifacts were copied here. Both unsuccessful startup logs are retained. These are harness failures, not red tests or retry attempts.

Focused TypeScript checking of the exact test/config passed using unchanged compiler options and combined dependencies. The full PR220 E2E typecheck initially failed with many missing-engine type errors in its then-incomplete dependency tree; raw output remains `/tmp/pr220-color-readiness-typecheck.log` and is not represented as passing. Parent subsequently reported the PR220 dependencies resolving again. The parent owns the subsequent full 35-case combined run and commit.

Reproduce from the private runner (identical test/config bytes are bound by `provenance.json`):

```sh
source /workspace/.lingxi-production/env.sh
cd /tmp/pr220-color-readiness-runner
PLAYWRIGHT_BROWSERS_PATH=/workspace/.lingxi-setup/cache/ms-playwright E2E_TELEMETRY_DISABLED=1 E2E_PROJECT=web E2E_STREAMING_FIXTURE=1 E2E_BASE_URL=http://127.0.0.1:5214 node e2e/web/run.mjs e2e/web/streaming-text.e2e.ts --grep 'Chinese and mixed leaves' --output artifacts/color-readiness-reproduced
```

Only synthetic renderer fixture text is present. Production source, actual provider, browser security settings and credentials were not changed.
