# #613 — formula rendering in artifacts

Base: `3cbc78d8`, SDK lock `3.8.21`. This is a synthetic public-content regression,
not a production incident replay or production acceptance.

## Ownership and source diagnosis

DesignWorkspace → ArtifactView → ArtifactEditorFrame → Design's compiled preview
(`buildPreviewDocument`, external `dc-runtime` with inline/blob fallback).
VisualizeText → GenUiMessageResponse → GenUiCard → retained page →
`web/document.ts` → opaque content iframe. Neither content document inherits the
application's KaTeX stylesheet or ordinary-message Markdown renderer.

The same public sample is in `scripts/fixtures/visualize-math-fragment.html`.
The archived Design editor renders zero KaTeX nodes. The current GenUI document
without the new math enhancement also renders zero. This establishes a missing
renderer for the fixture, not the exact source of an unseen user document.

## Change and syntax

Both content runtimes share installed KaTeX `0.16.47` and its official auto-render.
Supported delimiters are `\(...\)` (inline), `\[...\]` and `$$...$$` (display),
plus KaTeX auto-render's AMS equation/align/alignat/gather/CD environments.
Use KaTeX-supported TeX within one HTML text run; split formula delimiters across
HTML elements are not parsed. Single `$` deliberately stays literal to preserve
ordinary amounts; write inline math with `\(...\)`. Code/pre/kbd/samp, SVG,
MathML, Design source templates and `.no-math` remain authored.

The built math resource contains its CSS and installed WOFF2 faces as data URLs;
it does not load a math CDN. `trust:false`, bounded expansion/size, and the existing
CSP/sandbox stay in effect. Parse errors retain the readable source and surrounding
content. Failure to fetch the optional GenUI math resource keeps the original
content and SDK. A stalled math read falls back after eight seconds, leaving room
inside the existing 15-second whole-view deadline. Updates are observed, already rendered math is skipped, and
wide display formulas scroll with keyboard focus.

`lingxi:math-ready` is dispatched **on the content iframe window**, after rendering
and used fonts settle. It conveys no authority and writes no business state.
#611/#612 own resource lifecycle, container sizing and any listener integration.
This change performs no container measurement or host layout rewrite.

The pinned Design archive stays byte-identical. The build copies it to generated
`server/assets/design-editor` and changes two runtime injection points: the
external runtime and the `supportJs` used for inline/blob fallback. Content-hashed
entry/runtime names avoid immutable-cache collisions. `build:visualize-runtime`
builds these resources for web/server releases; no stored board file is rewritten.

## Executed browser checks

Run `npm run build:visualize-runtime`, Vite on `127.0.0.1:5285`, then
`python scripts/check-artifact-math.py --baseline` and
`python scripts/check-artifact-math.py` (existing Python Playwright + Chromium).

- Both entries: six formulas, three display blocks, Attention fraction/transpose/
  root subscript, summation, matrix, multiline alignment, five loaded KaTeX faces.
- Design's actual `__dcUpdate` template update and GenUI authored DOM update:
  `a_1=1` → `a_2=2`, still exactly six formulas.
- Both: reopen and refresh. GenUI additionally expands/collapses the real card.
- At 240px authored content width, Attention's 354px content scrolls inside a
  200px display region; no duplicate formulas. Illegal command, prices and real
  code remain readable and unchanged.
- Browser result and screenshots: `browser.json`, `baseline.json`, `design-*.png`,
  `inline-*.png` beside this file. Screenshot review confirms visible fractions,
  root/subscript, matrix and aligned rows; counts alone are not visual evidence.

## Boundaries and remaining gates

Design was exercised as the real editor at a standalone local test origin.
When wrapped in the current product outer opaque sandbox, its **baseline** can
fail with `Blocked a frame with origin "null" from accessing a cross-origin frame`
while reading `addEventListener`, then blank. This is a separate #611 integration
gate. No sandbox permissions were relaxed in product code. GenUI was tested with
its actual opaque outer/content frames. API data is deterministic fixture data;
production authentication, tenant ACLs, live model output and the user's original
artwork were not exercised. #559/#606 are unchanged and separately accepted.

Parent integrator must review the final SHA and combine with #611/#612 before
claiming production-entry acceptance. This task does not merge or deploy.

## Check results and environment failure record

- PASS: 9 focused document/resource regressions, 1 Design injection regression,
  4 CI-scope regressions; immutable visualization verification (223 files).
- PASS: explicit TypeScript check of `shared/artifact-math.ts`; web lint (46
  pre-existing warnings, no errors), initial web typecheck. Relevant changed-file
  lint passed after removing the obsolete router import.
- PASS: `build:visualize-runtime` including the math/Design build. Browser report
  covers the final math behavior; no actual Docker image was built here.
- NOT PASSED: full server typecheck initially used the environment's preinstalled
  SDK **3.8.16**, while the repository locks **3.8.21**; it reported native-v3/API
  mismatches. Aligning the SDK through configured GitHub Packages returned HTTP
  **401 Unauthorized**. The package credential was not changed and no alternate
  SDK package source was used. The subsequent clean install was cancelled,
  leaving the full local dependency tree unavailable. Full server/web build and
  integration acceptance require the correctly authenticated locked environment.
- A later test-selector run during that partial install failed due unavailable
  dependencies; it is not counted as a regression pass. Public build tools and the locked public Web dependencies were installed in
  temporary prefixes (excluding the unavailable SDK) to rerun isolated checks
  and both complete browser fixtures successfully. Repository manifests/locks
  are unchanged. A stale dev-server run during partial restoration failed at
  inline refresh; after restarting with restored public modules the complete
  fixture passed again.
- Independent review of the final PR/SHA remains the parent integrator's gate.

First PR CI run `41383576074` passed web/server/admin/control/deploy-contract,
but integration stopped before tests because its scoped dependency profile
lacked `katex/dist/katex.min.css`. The integration profile now includes the
existing locked KaTeX package; generated profiles and their regression passed.
No new version was resolved. Final CI result is tracked on PR #615.
