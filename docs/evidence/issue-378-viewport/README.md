# Official viewport controller integration (#378)

Base: `d3c08b994888e95159795950a3394df1d9f0b9df`. This branch owns the dependency upgrade and `ConversationThread.loadOlder`; PR411/412, avatars, question-map implementation, delivery and server behavior are outside its diff. No production access or real model requests were used.

## Change and source

Pin the published MIT `@assistant-ui/react` package to **0.15.31** and consume its existing `ThreadPrimitive.Viewport`, which now delegates to the official store controller. No copied controller, patched dependency or new scrolling state machine. The existing single, in-flow `data-chat-message-column` is a direct viewport child and is observed by upstream ResizeObserver; it needs no additional wrapper.

Published source inspected locally after npm integrity verification:

- [react 0.15.31 tarball](https://registry.npmjs.org/@assistant-ui/react/-/react-0.15.31.tgz): `src/primitives/thread/useThreadViewportAutoScroll.ts`, including `messagesPrepended`, attach/detach and existing provider binding.
- [store 0.3.22 tarball](https://registry.npmjs.org/@assistant-ui/store/-/store-0.3.22.tgz): `src/utils/thread-viewport-auto-scroll.ts` (`onContentResize`, `messagesPrepended`, `followGrowth`, `attach`) and `src/utils/viewport-scroll.ts` (`observeContentResize`). The shipped tests cover resize/cleanup and prepend reading anchors; this change validates our actual provider and DOM integration in Chromium.

The old product `loadOlder` captured a DOM anchor and applied another rAF scroll correction. The new official controller already maintains an anchor across prepend and later content growth. Remove that second owner; retain the history loading guard and clear it in `finally`. Selection/navigation pause, explicit bottom resume, source/message identities, history retry and read receipts remain unchanged.

Earlier local #378 profiling found SVG mutation callbacks inducing viewport geometry reads. New `onContentResize` skips subsequent scroll/state work when measured dimensions are unchanged, and ResizeObserver also handles intrinsic image/font growth. **Its MutationObserver still watches subtree attributes and reads geometry before that guard. This integration does not establish that animation layout cost, production frame rate or memory use is fixed.** The parent's separate historical-avatar and selector changes remain relevant. No memory leak is asserted.

## Dependency boundary

`dependency-changes.json` records all 66 changed/added/removed package version records. The upgrade requires core 0.3.31, store 0.3.22, tap 0.9.24, assistant-cloud 0.2.8, newer Radix and Zod dependencies. npm reports one deduped React/core/store installation across the existing assistant-ui extensions. Root assistant-stream remains 0.3.39; LingxiOS remains 3.8.11. Lockfile integrity values are committed. Rollback reverts this change's manifest/lock and loadOlder change together.

## Validation

`validation.json` retains run IDs, selected test outcomes and source/build SHA256 hashes. Checks ran on the source subsequently committed, with the dirty-base label retained rather than represented as an earlier commit's result.

Passed:

- Root `npm run typecheck`; focused fixture `tsc --noEmit -p e2e/question-index/tsconfig.json`.
- Targeted Biome lint; `git diff --check`.
- Isolated production fixture build and full production `vite build` (41.26 seconds). Existing CSS/large-chunk notices and Zod pure-annotation warnings remain; no build errors. This was the frontend build, not the unrelated visualize prebuild or server suite.
- Existing history failure/retry/prepend/keyboard test; existing latest-question streaming/pause/resume test.
- New synthetic viewport test: intrinsic image decode, rendered KaTeX size change, selected text preservation, direct upward scroll plus new content, explicit resume, conversation unmount and observed target release. Final version passed in 3.64 seconds through official `@e2e-dev/web`, with no model-backed test steps.

One additional broad navigation test **failed** before reaching its scrolling assertions: after focusing question 22, the tooltip displayed question 21 instead of question 22. The independent direct-scroll regression above passed. Attribution of this tooltip failure to the upgrade versus the existing question-map behavior is **unverified**; do not report the full navigation suite as green. The question-map owner is informed through the PR handoff; no unrelated map patch was made.

Initial check setup failures were corrected: a CLI path was wrong, the temporary runner config resolved tests relative to its own directory, and the fixture TS project omitted the product's existing DOM `moveBefore` declaration. The committed fixture TS include fixes that omission. Initial new test Window declarations were corrected before its passing run. These are not product runtime failures.

## Reproduce only the affected checks

```sh
node node_modules/vite/bin/vite.js build --config e2e.question-index.vite.config.ts
node node_modules/vite/bin/vite.js preview --config e2e.question-index.vite.config.ts
# In another shell; E2E_CDP_URL is optional for an installed Chromium connection.
E2E_TELEMETRY_DISABLED=1 E2E_BASE_URL=http://127.0.0.1:5293 node_modules/.bin/e2e run --config e2e.question-index.config.ts --grep 'older history retries|latest question stays|viewport follows' --trace off
```

No additional independent review, full regression repetition or real-model qualification was performed, per the user's current instruction. Exact PR-head CI and production acceptance are separate from these local results. Only the designated integrator merges/deploys; this PR does not close the overall performance issue.
