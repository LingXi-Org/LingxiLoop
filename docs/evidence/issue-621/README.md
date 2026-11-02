# #621 — static built-in Slides style

Base: `c274735c818766eff2c5bff2b6936c6f0c12ca31`. This branch does not edit
`scripts/build-slides-editor.mjs` or any #620 resource/CSP/font-loading adaptation.
It is development-only; the parent integrator owns review, merge and production.

## Source recovery and limits

The source is the already pinned **Slides** distribution at
[`c15e76ef5134228d2bb5da35652d30d7d6b8a34d`](https://github.com/JimLiu/baoyu-design/tree/c15e76ef5134228d2bb5da35652d30d7d6b8a34d/skills/claude-slides).
No upstream upgrade, dependency, `claude-design-system` skill/editor/runtime,
Ember or Seazar data is added. The maintained recovered source and the archived
original keep their existing attribution. `source-map.json` maps these modules
to the pinned `node/compiler.cjs` lines below.

| Data / consumer | Recovered data and owning source | Pinned compiler line |
| --- | --- | --- |
| Palette | `model-type-scales.js`: slate `#141413`, ivory `#FAF9F5`, ivory-warm `#F5F4ED`, clay `#D97757`, oat `#E3DACC`, white, secondary and tertiary text | 112201 |
| Type ladder | Same module, `anthropicTypeScale`: display 128/300/1.15, h1 112/300/1.2, h2 96/300/1.2, h3 72/300/1.2, lead 44/430/1.4, eyebrow 36/500/1.2, body 32/430/1.4, caption 24/430/1.4 (size/weight/line height) | 112201 |
| Font fallbacks and paint | `rendering-theme.js`: Georgia/serif for display roles, system sans for other roles; `slideBackgroundColor` defaults to ivory-warm and `slideTextColor` selects readable slate/ivory | 140142 |
| Existing layouts | `editor-templates.js`: ten factories, coordinates/margins/content retained | 244936 |
| New-page inheritance | `editor-template-restyling.js`, used by both picker previews and the final insertion in `editor-app.js` | 245510 |
| Save / reopen | `serialization-html.js` writes explicit CSS; `files-slide-codec.js` carries the existing `style` array and installed palette records | 135554 / 256371 |

`builtin-style.json` packages these values in the existing tokens and look-memory
formats. The semantic slot wiring is a native integration: the renderer's warm
background and readable ink become the default, while the named palette is
available for user edits. It is **not recovered demo metadata**. Static Georgia
and generic system fallback stacks are used; no proprietary Anthropic font files
are assumed, fetched or bundled. Platform/CJK font fallback and supported font
weights vary; the source's 430 weight may normalize to 400 in saved HTML with the
available system family.

The screenshot referenced by the issue was inspected. It shows a five-page sleep
deck and an orange, sans-serif page. The fixed archive references
`artifact-type/demo.html` but does not contain that file, its slide HTML, design
system tokens, exact orange/theme assignments, images or font binaries. Those
cannot be recovered from that screenshot. This PR restores the available Slides
palette/type ladder as an owned default; it does not claim to reproduce the
screenshot, its slide content or its exact typography.

## Implementation and compatibility

`kinds.ts` supplies the new-deck index with local palette attribution and existing
look memory. `writeInitialIndex` publishes the index and
`project/ds/slides-builtin/tokens.json` together, only on artifact creation, using
`ifMatch:null`. The order remains empty until the user chooses a layout. Existing
artifacts, reads, reopen and idempotent create retries receive no default writes.
Design initialization is unchanged.

The template restyler reads current look memory before text exists, ignores the
zero-count system placeholders, and fills missing type roles. Existing observed
text styles take precedence. HTML's normalized display/lead roles are matched
back to remembered typography when possible. Current background and the normal
inference/contrast logic remain in control. A blank current slide also transfers
its background when no typography can be inferred. No stored slide is restyled
merely by opening it. Theme-panel edits continue to update the same persisted
look memory and ordinary HTML, so subsequent pages can inherit those edits.

## Executed checks

- `node --test scripts/slides-editor.test.mjs`: nine checks passed after the
  implementation, including ten layout factories, blank-first creation,
  palette/type equality against the pinned original, edited look plus HTML
  roundtrip, legacy styling, immutable archives, source-only build and compression.
  The initial behavior regression reproduced `white` instead of `#f5f4ed`.
- Focused `artifacts.test.ts` with the repository runner's dummy unit environment:
  12 checks passed, including fresh default initialization and unchanged Design.
  An initial direct invocation without that environment stopped at required-env
  guards; it did not run the tests.
- `npm run server:lint`: passed (580 files).
- `npm run server:typecheck`: **not passed locally**. The image has SDK 3.8.16,
  while the repository locks 3.8.21; existing native-v3/model API declarations
  fail in runtime/integration files. No errors point to the changed artifact
  initialization files. No credential, package lock or SDK was changed. Required
  CI must use its authenticated locked install.

## Browser and export evidence

Replay: `npm run build:slides-editor`, then
`python scripts/check-slides-default-style.py` (Python Playwright and Chromium).
The fixture uses the real generated editor, an opaque `allow-scripts` iframe,
product initializer and download adapter, actual clicks and deterministic
file/session/publish HTTP responses with CAS checks. It does not exercise
production authentication, database transactions, tenant ACLs or live user data.
The historical document is a synthetic custom-style fixture, not a user's deck.

Browser validation and sample inspection are recorded alongside this file.
Required CI and the parent's independent frozen-candidate review remain gates;
this branch does not merge, approve, deploy, release an SDK or close the issue.

Chromium **154.0.8037.57** passed the complete fixture on the final source build:

- Baseline empty legacy deck: white background and Helvetica remain
  (`legacy.png`). Pre-existing custom deck: no publish and byte-identical source
  after open (`legacy-custom.png`, `browser.json`).
- New product initializer → blank → title → title/body → two columns: warm
  background, Georgia/serif headings, system sans body, and the recovered type
  sizes are visible (`title.png`, `two-column.png`).
- Saved files reopen without a rewrite (`saved-files.json`, `reopened.png`).
  The existing theme panel exposes the local palette (`theme.png`).
- Actual theme-panel actions choose Helvetica for headings and `oat` for the
  background. The next title/body page is `rgb(227,218,204)` with Helvetica;
  reopen leaves those saved bytes intact (`edited-inheritance.png`,
  `edited-files.json`). No browser page errors were observed.
- Download buttons created all three actual files before those edits:
  [sample.html](sample.html), [sample.pdf](sample.pdf), [sample.pptx](sample.pptx).
  All contain the four-page default-style example, with a deliberate blank page
  first. The PDF options are confirmed through the actual button in the opaque
  iframe, retaining its sandbox permissions.

| Format | Actual verification | Limit |
| --- | --- | --- |
| HTML | Opened downloaded file through an ordinary HTTP fixture; ArrowRight reaches page 2/4; CSS retains Georgia, 128px title, 44px lead and warm background (`html-inspection.json`, `html-page2.png`) | Available system/CJK glyph fallback differs visually from the editor; no font binaries are embedded by this change |
| PDF | Actual editor export, opened with `pdftoppm`; page 2 visible with warm background, text, placement and hierarchy (`pdf-page2.png`) | CJK text uses the export environment's fallback and is visibly different from the editor's serif glyphs; exact font/pixel identity is not qualified |
| PowerPoint | Actual current-font download; ZIP/XML inspection confirms all four slide parts, `F5F4ED` background, `141413` ink, Georgia/Arial typefaces, text and expected point sizes (`export-inspection.json`) | System-font substitution is platform-dependent; not opened in Microsoft Office/LibreOffice and no pixel-parity claim is made |

The helper includes the export inspections and optional `pdftoppm` rendering.
A direct `file://` preview was refused by the browser's administrator policy;
the supported ordinary HTTP preview succeeded. No policy or credential changed.
Earlier browser fixture attempts had an overly broad dialog locator and the
wrong font-menu role; the final fixture uses the PDF test ID and actual
`menuitemradio` controls. These were fixture corrections, not product workarounds.

The changed existing `artifact-app-boundary.test.ts` additionally asserts that
real database-backed creation publishes both the index and local tokens. It was
not run locally; required CI owns that transactional assertion. Local source
checks do not substitute for it. Check the draft PR's final-SHA CI status before
integration. Full production-entry acceptance remains with the single integrator.
