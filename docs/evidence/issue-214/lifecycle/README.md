# PR220 Text lifecycle correction

Base: 1f18e4f3cf370d853248affcb161e29395994b5c (implementation 80c1aaee). These two gaps were already present in b7b165fd; this correction completes the interruption/preference acceptance surface and does not claim PR220 originally introduced them. Failure model and new E2E tests were written before production changes.

The production change is limited to MarkdownText's part identity and SDK smooth policy. An interrupted message settles all its Text parts, including non-last parts that assistant-ui normalizes to complete. Normal completed output still drains its pending SDK queue. Once reduced motion has displayed a part in full, that part keeps smoothing disabled for its remaining lifetime: changing the preference back cannot resume an obsolete prefix. A new explicit activity part identity (or message/slot) starts a fresh lifetime and streams normally. No package patches, new smooth engine, transport or state protocol changes were introduced.

## Red and green evidence

| Scenario | Before | After |
| --- | --- | --- |
| Text followed by Tool, message cancelled | Received 982 characters; terminal samples showed 299/450/563/665, with one caret | All terminal samples show 982 characters and zero carets |
| Text followed by Tool, message error | Received 982 characters; terminal samples showed 168/308/400/530/658, with one caret | All terminal samples show 982 characters and zero carets |
| Reduced motion false → true → false | Full 1262 characters retracted to 206/290/485/631 | Samples remain 1262 throughout; a new part in the same message/slot reveals 0/21/446/1041/1073/1083 characters normally |
| Normal completion | Pending text drains normally | Pending text still has an intermediate 872-character prefix before all 1262; then caret=0 |
| Replacement with completed history | Static | Static, without streaming words/caret |

- New suite: red **3 failed / 1 passed**, then green **4 passed / 0 failed** (13.49s including runner startup).
- Original PR220 renderer suite: **7 passed / 0 failed** (20.38s), including initial reduced-motion queue bypass, normal completion/cancel, references, Markdown/CJK and history.
- Web tests: **65 passed / 0 failed**. Lint and E2E typecheck passed. Full npm run build (including web/node typecheck) passed, with existing CSS/chunk warnings retained in build.log.

The terminal test first waits for the actual official message state to become incomplete and asserts a nonempty sample set; a passing empty-array every() is impossible. The fixture exposes the actual SDK part/message statuses, does not mock MarkdownText or the queue, and includes a real following tool-call part. It retains all received input text, deliberately isolating renderer behavior from #215 persistence semantics.

The media test emits actual matchMedia subscription change events using a test-controlled media object. It verifies JavaScript queue lifecycle, not native CSS preference emulation. The official website TLS and native CSS acceptance remain separate integrator gates. These are synthetic renderer tests, not live-provider performance claims.

## Reproduction and provenance

Use the exact lockfile dependencies and existing browser cache. No custom Chromium launch arguments, TLS bypass, sandbox change, new credentials or production access are involved:

    source /workspace/.lingxi-production/env.sh
    node node_modules/vite/bin/vite.js --port 5206 --strictPort
    PLAYWRIGHT_BROWSERS_PATH=/workspace/.lingxi-setup/cache/ms-playwright E2E_TELEMETRY_DISABLED=1 E2E_PROJECT=web E2E_STREAMING_FIXTURE=1 E2E_BASE_URL=http://127.0.0.1:5206 node e2e/web/run.mjs e2e/web/streaming-lifecycle.e2e.ts --output artifacts/lifecycle-reproduction

The native red/green/existing reports, JUnit, metadata, screenshots and failure traces were relocated intact from artifacts/pr220-lifecycle-* into the corresponding directories here. report.json is losslessly gzip-compressed; original command/artifact paths and working-tree revision metadata remain unaltered. The red renderer file equals the PR head; the green renderer equals the source hash in provenance.json. Native reports were generated before this corrective commit, so their git metadata alone does not identify the final source; use the explicit hashes.

Private independent review setup and diagnostic history remain at /tmp/pr220-runtime-review/REVIEW.md: initial cache/config/selector readiness errors were not product failures, and the original cancellation probe's empty-set pass was rejected before the stricter real red test. The corrective branch's first invocation also rejected an output directory outside its project root before executing any tests; red.log is the subsequent actual four-case run. No failed attempt was relabeled as green.

Only the assigned integrator may combine this change with the independent tail-window fix and decide exact-head review, CI, merge and deployment. This branch does not push, merge or deploy.
