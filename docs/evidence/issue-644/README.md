# #644: short formula scrollbar

2026-11-02, base `4aa55d8c` (includes #643). Public synthetic formulas only. No original artwork, production writes, credentials or deployment.

## Observed cause and smallest fix

In the actual GenUiCard and Design renderer, `$x_1$` and `$\sqrt{x}$` produce a scrollbar despite ample container width. This is independently reproduced, not a claim to have reproduced the still-unprovided original user example.

The pinned KaTeX CSS gives `.vlist-t2` a `margin-right:-2px`, compensating a 2px `.vlist-s` table cell. DOM measurements locate that spacer 2px past the inline formula's right boundary. `artifact-math.ts` makes that formula an `overflow-x:auto` scrollport, so the spacer becomes a scroll range. This measured case is not a subpixel-rounding hypothesis.

| Real GenUiCard, 16px host font | Before | After |
| --- | --- | --- |
| `x_1`: clientWidth / scrollWidth | 19 / 21 | 21 / 21 |
| `x_1`: offsetHeight / clientHeight | 47 / 32 | 32 / 32 |
| `sqrt{x}`: clientWidth / scrollWidth | 27 / 29 | 29 / 29 |
| `sqrt{x}`: offsetHeight / clientHeight | 46 / 31 | 31 / 31 |
| Computed formula font size | 19.36px | 19.36px |

The shared inline scrollport now reserves `padding-inline-end:2px` for this known KaTeX spacer and uses `box-sizing:border-box` to stay within `max-inline-size:100%`. No overflow threshold, hidden scrollbar, clipping change, font reduction or observer is introduced. Display-math rules and `lingxi:math-ready` are unchanged. The #643 flow-size files are untouched.

## Actual entry inventory and results

Cloud `/usr/bin/chromium` **154.0.8037.57**, Linux headless. Short inline and display formulas, fractions, roots, subscripts, matrix/aligned and truly wide formulas are included. Measurements wait for fonts to settle. CSS zoom checks are 80%,100%,125%,150%; these are not claims of testing each browser's UI zoom control. Chat/file/forum/native include device scale factors1 and2. Design/GenUI also resize the guest content to241.375px, and Design/Slides run within their actual transformed editor canvases.

| Entry and actual owner | Result |
| --- | --- |
| Chat: `MarkdownText`, official Streamdown primitive, `chat.css` | Short formulas do not have a useless scroll range; wide display math scrolls with ArrowRight. Dynamic update and refresh pass. No product change. |
| File Markdown: `MarkdownGreenfieldChunkRenderer` | Same short-formula result; wide display math scrolls with ArrowRight. Dynamic update and refresh pass. No product change. |
| Forum: `MemoContent` / `MathMarkdownRenderer` | Short inline math has visible overflow, short display math's scroll range is0. Dynamic update, width changes and refresh pass. No product change; keyboard interaction was not separately asserted here. |
| Native content: actual disabled `ContentEditor`, official BlockNote math specs | Inline preview uses visible overflow; short block preview scroll range is0. Dynamic update, width changes and refresh pass. No product change; keyboard interaction was not separately asserted here. |
| Design: rebuilt pinned editor + shared artifact math | Short inline range2→0. Narrow long formula remains scrollable and keyboard operable; update, refresh and reopen pass. Read-only fixture makes no publish requests. |
| GenUI: real `GenUiCard`, pinned guest SDK, opaque frames | Short inline range2→0. Narrow inline matrix and wide block retain real scroll ranges and focusability; ArrowRight moves the block. Updates and refresh pass. No CSP override. |
| Slides: rebuilt native editor / `slides-source/math.css` | Short formulas have no math scrollport and no useless bar. Fractions/matrix/aligned remain rendered through editor transforms, refresh and reopen. Existing native text-fit behavior is unchanged; this does not establish a separate keyboard scroll affordance in Slides. Read-only fixture makes no publish requests. |

The multi-entry runner passed **51 scenarios**; the GenUiCard runner passed **8 scenarios**. The positive GenUiCard short-range assertion was first run against the base and failed on the measured2px range before the CSS change. The baseline mode independently records the actual bug.

In the same GenUiCard snapshots, display fraction/matrix/aligned boxes retain their font sizes and heights (48/56/77px respectively) before/after. Visual records show the numerator, denominator, radical and matrix/alignment edges; the change does not remove their padding or clip the glyphs.

- [Multi-entry before](entries-before.json), [after](entries-after.json). Baseline combines the initial four-entry run with the additional forum/native host run; no measurements are synthesized. JSON is losslessly compacted to one scenario per line.
- [GenUiCard before](inline-before.json), [after](inline-after.json).
- GenUiCard [before](inline-before.png), [after](inline-after.png), [wide formulas at narrow width](inline-after-narrow.png).
- Design [before](design-before.png), [after](design-after.png), [narrow](design-after-narrow.png).
- Chat/file/forum/native [before](chat-file-before-dpr1.png), [after](chat-file-after-dpr1.png).
- Slides [before](slides-before.png), [after](slides-after.png).

## Reproduction

Use the repository's normal public dependencies and pinned SDK, then:

```sh
npm run build:design-editor
npm run build:slides-editor
# Keep this process running in another terminal:
npm run dev -- --host 127.0.0.1 --port 5299
python scripts/check-math-scrollbars.py
node scripts/check-math-scrollbars-cdp.mjs
node --test scripts/artifact-math.test.mjs scripts/slides-math.test.mjs
```

The default test origin is `http://127.0.0.1:5299`; `VISUALIZE_TEST_ORIGIN` overrides it. `--baseline` records the independently reproduced short-scrollbar case using a base build; `--entry host|design|slides` limits the Python runner. The check uses the same Design sandbox flags as `ArtifactEditorFrame` (including its existing `allow-same-origin`) and the opaque Slides configuration. Its synthetic `math.test` APIs are local routes, not a tenancy, CSP or authenticated-server acceptance test. No editor writes are permitted.

This worker's public-only dependency cache uses symlinks outside the clone. Only the disposable Vite config additionally allowed that exact package-cache directory so the actual KaTeX WOFF2 files could load; production Vite config and sandbox/security policy were not changed. Early fixture attempts corrected a missing standards doctype, matched actual sandbox flags, and scoped Slides measurements to the main canvas rather than its later-mounted thumbnails. Final runs use the checked-in scripts and exited0.

Local checks: 11 focused existing artifact/Slides math tests pass; strict shared-math TypeScript and Biome lint pass; Design and Slides editor builds pass. CI supplies the complete application build with the normal private SDK dependency; no credential/registry changes or private-registry retries were made locally.

## Remaining boundary

A single consolidated question is in [#644 comment6579678952](https://github.com/LingXi-Org/LingxiLoop/issues/644#issuecomment-6579678952). The original short formula/screenshot/device/browser has not been provided. Firefox/WebKit are not installed in this worker, and no result is claimed for them, physical devices, browser UI zoom, production artwork or intermediate font-loading frames. Independent integration review and production release remain with the designated integrator. This evidence supports the measured KaTeX-spacer fix, not closure of every possible source of tiny overflow.
