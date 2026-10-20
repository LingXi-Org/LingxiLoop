# PR220 tail-window follow-up

Base: `1f18e4f3cf370d853248affcb161e29395994b5c` (implementation `80c1aaee`).

Failure model recorded before implementation:

- `**one** two` produces fresh tokens `[' ', 'two']`; `one **two**` produces `['one', 'two']`. Whitespace must remain byte-for-byte present but must not consume a word slot.
- `one two\n\nthree` and `甲乙\n\n丙` clear the previous structural block entirely. A whole text-part window must retain `two/three` and `乙/丙`, respectively.
- Fixing the window must retain one caret, original Markdown/mention/citation offsets and the official rendering/animation implementation. Already stable blocks must not be reparsed or replayed on every tail update.

The new `e2e/web/streaming-tail-window.e2e.ts` regression was written before changing implementation. It uses the production MarkdownText and assistant-ui runtime through the existing renderer fixture and official tester-army/e2e + @e2e-dev/web engine.

The scope includes the same native text-part being split into Markdown slices around a pending visualize reference. A separate failure model/test was added before that wrapper change: two providers produced three fresh words and two carets. The shared original-part owner fixes this without changing reference parsing, authorization, sandbox behavior or offsets.

## Implementation

- Leading whitespace stays in a lossless token prefix, outside the colored word; only actual words consume the official two-word window. Original Markdown and its UTF-16 citation positions are not reconstructed.
- Committed AST leaves register each block's word count, capped at two, with a text-part owner in a layout effect. Registration happens after commit, never during render. The owner publishes only changed distances for the tail blocks; the last two counts suffice to determine the window. Existing cached block trees and their rehype plugin identities remain stable.
- The original official component still renders and animates the words/caret. Later blocks contribute their distance rather than CSS clearing all earlier block colors. The original 700ms transition settles words leaving the window, and only the true tail renders a caret.
- The shared owner spans `VisualizeText` slices, ordered by the existing TextOffsetContext offset and block index. It is scoped by the existing part key. No runtime, dependency, migration, source parser or smooth/status condition changed.

## Red/green evidence

| Receipt | Result | Meaning |
| --- | --- | --- |
| `red/` | 2 failed | First new E2E attempt; also revealed an observation race when successive Markdown inputs have the same visible text. Kept honestly. |
| `red-settled/` | 2 failed | Added two frames before checking a replacement, still before implementation. Both failures now match the review's exact models: whitespace consumes a slot; block windows remain separate. |
| `green-initial/` | 2 passed | Initial two fixes. |
| `split-red/` | 1 failed / 2 passed | New pending-visualize split case added before changing VisualizeText. Actual `fresh=[one,two,three]`, `carets=2`. |
| `green/` | 10 passed / 0 failed | All 7 original streaming cases plus 3 new cases, with official engine videos. |
| `green-tail-settled/` | 3 passed / 0 failed | Added explicit post-850ms stale-color assertions and settled screenshots to the 3 new cases; final test source. These are the same three cases, not three extra unique tests. |

The native reports and raw stdout logs are retained. `report.json` files are losslessly gzip-compressed; use `gzip -dc report.json.gz` to inspect them. Reports truthfully identify a working tree based on `1f18e4f3`; `provenance.json` pins the final tested implementation files by SHA-256. The final implementation is unchanged between the 10-case run and the final three-case run (apart from removing an extra EOF blank line in CSS); the latter only strengthens test assertions.

Actual results include:

- `**one** two`, `one **two**`, and tab/multiple spaces: both real words fresh, original whitespace exact.
- `one two` → `one two\n\nthree` → `one two\n\nthree four`: `[one,two]` → `[two,three]` → `[three,four]`, one caret throughout.
- Paragraph/heading/list Chinese boundary: `[乙,丙]`, one caret, no stale blue after 850ms.
- Pending visualize reference: `[two,three]`, one caret, no stale blue after 850ms.
- Original English official-source comparison still matches 500ms entry, 700ms transition and 2×16px caret. Original Chinese trace still shows continuous color recovery, stable node identity, **0 DOM mutations** in the settled paragraph, and one visible caret. DOM mutation evidence is not claimed as a CPU benchmark; stable AST reuse also follows from unchanged memoized Block inputs and the summary-only subscriptions.

## Checks and reproduction

Node 22.23.3; locked `e2e` 0.17.0 / `@e2e-dev/web` 0.12.0; existing Chromium cache `/workspace/.lingxi-setup/cache/ms-playwright`; no TLS or sandbox flags changed. The default-cache attempt could not download a browser and executed no tests; after selecting the existing legitimate cache all native runs executed normally. A private fixture Vite API server on port 5204 used the production renderer, React plugin, alias and assistant-ui dedupe with an isolated `/tmp` dependency cache. No shared node_modules target was modified.

For normal reproduction use the existing fixture server and official engine:

```sh
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5204 --strictPort
PLAYWRIGHT_BROWSERS_PATH=/workspace/.lingxi-setup/cache/ms-playwright \
E2E_STREAMING_FIXTURE=1 E2E_BASE_URL=http://127.0.0.1:5204 \
npm run test:e2e:web -- e2e/web/streaming-tail-window.e2e.ts e2e/web/streaming-text.e2e.ts --video on --output /tmp/pr220-tail-recheck
```

- `npm run lint`: passed, 5 existing warnings and 2 infos.
- `npm run test:e2e:typecheck`: passed.
- Owning `markdown-text.test.tsx`: **12/12 passed**, including citation offsets and Markdown semantic layout.
- `npm test`: **65/65 passed**, 0 skipped.
- `npm run build`: passed, including typecheck and the existing visualize integrity/build prechecks; retained existing CSS/chunk warnings.
- `git diff --check` for implementation/tests: passed. Native reporter Markdown intentionally retains its two-space hard line breaks; those original evidence files are not whitespace-normalized.

This follow-up addresses the tail/whitespace P2s only; separate cancellation/native motion lifecycle findings belong to the other assigned branch. The official live-site/native reduced-motion acceptance is coordinated by root, and this evidence does not impersonate it. The sole integrator must resolve the small shared MarkdownText JSX/import boundary and review the combined final head before release.
