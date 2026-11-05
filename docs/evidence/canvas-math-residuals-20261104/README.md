# Existing canvas and math issues: residual audit, 2026-11-04

Base: `8cc00fd8` from current `origin/main`. Read all bodies/comments/assignees
of #612, #613, #621, #624, #631 and #644, their merged implementation PRs, the
original Roadmap files and the current owning code. All six issue assignee lists
were empty. The following work was already merged and was **not reimplemented**:

| Issue | Existing implementation | Current local result |
| --- | --- | --- |
| #612 | #643 natural-height admission/model reflow | Hash-verified original, all 13 scenarios pass; 22 height-feedback controls pass |
| #613 | #615 and #640 artifact math/dollar recognition | Two original Roadmap formulas render; five actual GenUiCard/CDP scenarios pass |
| #621 | #623 source-derived Slides default | New/legacy/custom, edited inheritance, save/reopen and three actual export checks pass |
| #624 | #625 optional-resource failure isolation | CSP-blocked beacon, failed optional script, edit/CAS/reopen/refresh, critical failure beyond deadline and fresh-grant retry pass |
| #631 | #636 Slides math/editor/export | One actual residual fixed below; editor/read-only/fullscreen/save/reopen and three actual exports pass |
| #644 | #645 KaTeX spacer width | 51 entry scenarios plus eight GenUiCard/CDP scenarios pass, including keyboard scrolling for genuinely wide math |

## Actual residual change

Slides' independent dollar selector treated `$-5$` and `$hello world$` as math.
More seriously, `Budget $-5; formula $x^2$` consumed the opening dollar of the
real formula, leaving it unrendered. The existing Design selector already guards
negative numeric amounts and prose. The Slides selector now applies those same
literal guards and excludes negative price dollars before matching inline math.
KaTeX remains the delimiter/TeX owner. Explicit delimiters, marked/multiline
formula sources, rich marks, raw saved text and native document format remain
owned by their existing paths. `$-2^n$` and the original RNN notation still render.

The added regression failed on unmodified main (`negative-price-before.txt`).
The actual generated main Slides editor also failed the new browser variant:
seven formulas appeared where eight were expected (`currency-browser-before.txt`
and `slides-currency-before.png`). After the correction the same variant has
eight formulas, preserves the negative prices/prose, saves once without KaTeX
markup entering the document, reopens, presents in actual fullscreen and retains
eight formulas in read-only preview. Its offline HTML has eleven formulas across
three pages and preserves the literal amounts/prose. `slides-currency.json`,
`currency-browser-final.txt` and the after/export screenshots record those results.

Actual HTML/PDF/PPTX downloads were created for both the currency/math and default
style checks. Their hashes/lengths are in `export-hashes.json`; full exports remain
in ignored `.codex-tmp/currency-final` and `.codex-tmp/slides-style-current`, rather
than duplicating large historical fixtures in this PR. The HTML was opened with
subsequent network requests blocked. PDF was rasterized with Poppler. PPTX ZIP/XML
checks verify the math-page picture, plain-page native text and notes. The packaged
math-page picture is `slides-currency-pptx.png`. No Office client was run this time.
The previously recorded #631 LibreOffice check is historical evidence, not a new run.

## Original Roadmap and fixture upkeep

Read copies of `canvas.json` and `Roadmap.dc.html` at the user's fixed public
source commit `4d5abe3e5307cbea55533f6f32ef158bbecc5593`. SHA-256 matches:

```
9ea199d03f506b9528681361118e5b9cd0e34ba2c7bceb5dc6d999ae7a5c84e3  canvas.json
5260ac66ada5f34423a7bfddf313a33f2d9d2c29c090c61275ed5c78bf34bfdb  Roadmap.dc.html
```

`roadmap.json` records the current original-copy replay: 1280x1180 becomes
1280x1715, scroll extent equals viewport in both directions, both formulas render,
and the heading stays 44px. Async growth/removal, retained iframe reopen, 768px
viewport, native text edit/CAS/refresh, full-window/back, conversation isolation,
neighbor/arrow movement, mixed text/image/code/table/math, outer pan and repeated
growth without row drift all pass. The independent public mixed-content control
remains 875px high (`flow-control.png`). Original screenshots/source remain local.

Three stale fixture assumptions initially stopped this replay. They were corrected
without modifying product authorization, CSP or geometry:

- The local service omitted its fixed asset origin from `connect-src`, whereas
  current production `editor-router.ts:pageCsp` already includes it. Native critical
  program fetches were therefore blocked only in this fixture. Its source allowlist
  now matches production; the external Cloudflare beacon remains blocked.
- The local editor grant omitted the required `expiresAt`, forcing a new iframe
  on reopen. The synthetic grant now supplies a future timestamp.
- The checker still requested the old English "Back to canvas" button after the
  installed Chinese editor translated it to "返回画布".

The initial CSP failure and later retained-frame/button assertions were real failed
attempts, not product passes. After those fixture corrections, all 13 original-copy
scenarios pass. The #624 fixture also passes its fault/recovery scenario with the
production-matching policy (`startup-recovery.json`). Only ephemeral local test TLS
material was generated for its loopback HTTPS fixture; no account credential changed.

## Commands and verification boundary

Environment: Debian managed cloud, Node 24.19.0, Chromium 154.0.8037.57. Product/API
fixtures are deterministic local services, not production tenancy or live model tests.
The original source copies are public exported samples, not writes to production.

Executed owning checks: final `scripts/slides-editor.test.mjs` **24/24**, final
artifact/Slides math leaf checks **15/15**, Design's existing owning tests passed
in the first combined run, and the 22 actual guest/model feedback controls pass.
The initial combined run was 41/42: one Slides input-path assertion failed because
the entire local `node_modules` was symlinked to the shared checkout. Copying only
the public KaTeX package into the worktree restored its expected manifest path;
the full Slides suite then passed. No lockfile, credential or SDK change was made.
The maintained vendored source is excluded by Biome, so no lint pass is claimed
for that path; JavaScript/Python syntax and `git diff --check` passed.

The first `--math-retry` currency browser attempt stopped at a detached/unstable
retry button; a fixture MathML `inner_text` query was also corrected to
`text_content`. Neither failed attempt is counted as passing. The completed
currency scenario uses normal resource delivery; fault/retry coverage for Design
is reported independently. Browser geometry, acceptance assertions and export
checks were retained, not disabled to obtain a passing run.

Reproduce (after normal dependency installation/build):

```sh
node --test scripts/artifact-math.test.mjs scripts/slides-editor.test.mjs scripts/design-editor.test.mjs
python scripts/check-slides-math.py --currency-regression --evidence-dir .codex-tmp/currency-final
```

The existing #612/#624/#644 evidence READMEs describe their service/browser setup.
This replay used ports 4293 (Roadmap), 4194 (startup HTTPS) and 5299 (Vite); set
`VISUALIZE_TEST_ORIGIN=http://127.0.0.1:5299` for both CDP math checks. To rerun #621
without overwriting historical evidence, replace only its evidence directory with
`.codex-tmp/slides-style-current` in a disposable execution copy of its checker.

## Serial handoff and remaining limits

The only overlap with #670 / draft #672's inspected file inventory is the existing
`perf/issue-611/serve.ts` fixture. Preserve the two small corrections above when
integrating its Visualize retirement. No Design model, shared math, runtime,
conversation or sidebar product file was edited here. The Slides math source and
new test variant are independent of #672's current file list. After #670 retires
GenUiCard, its current-entry results above become historical compatibility evidence;
do not reintroduce the retired surface to preserve these tests.

Hand off to sole integrator task `01a19a90-dfc4-77f7-9803-e9035c481026` for independent
final-candidate review, CI/conflict coordination, merge and green production deploy.
No merge, PR approval, issue closure or production deployment was performed here.

Original affected Slides deck and #624/#644 screenshots/browser details remain
absent; they are not a waiting condition under the user's current authorization.
The original Roadmap is covered, while other browser/export fixtures are synthetic.
Firefox/WebKit, physical devices, new Office-client rendering, live multi-user
concurrency and production artwork acceptance were not run. Fixed-height interactive
artboards retain authored viewport behavior; natural-height admission is still
conservative, not a general CSS dependency solver. Keep these limits separate from
the completed development and measured regressions.
