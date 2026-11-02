# #631 — Slides math, synthetic reproduction and exports

This is independent Slides validation, not #613's Design/visualization result.
No affected user deck, page number, original formula or screenshot was supplied
in #631, including the final comment recheck. One consolidated request was posted
at [issuecomment-6573254182](https://github.com/LingXi-Org/LingxiLoop/issues/631#issuecomment-6573254182).
All decks and screenshots here are synthetic. Original-work acceptance remains
open; this change must not automatically close #631.

## Concrete defect and implementation

Baseline `2b33a54c` renders delimited math as raw text in `RichTextContent` and
table cells. PPTX measurement independently reads that raw text. A real Chromium
replay records zero math elements and visible source in `baseline.json` and
`before.png`.

The change renders derived runs with already locked KaTeX 0.16.47 and its own
delimiter splitter. It handles marks spanning a formula and newlines inside
matrix/aligned environments. The edit DOM and serialized source retain TeX;
there is no new document field, migration or model version. Code is identified
using the existing `mono` family/fallback enum; backtick code and currency stay
literal. KaTeX uses `trust:false`, strict validation, bounded expansion/size and
separate macro state. Invalid/unsupported input falls back to escaped source.

Fonts are local, content addressed and loaded on demand. Offline exports keep
KaTeX font families selected through CSS classes and inline their WOFF2 files.
No editor sandbox, CSP, tenant/project authorization or API contract changed.
Display math wraps at KaTeX `.base` breakpoints. Indivisible matrices scale to
the content width, accounting for padding and the editor's zoom; existing
vertical text fitting continues to own the text box.

PPTX formula pages use the existing slide PNG capture at 2×, preserving their
appearance and speaker notes. The exporter explicitly warns that these pages
are pictures and formulas must be edited in the original presentation. Plain
pages retain native PPTX text. PDF/HTML use the same renderer with embedded
fonts. Hidden accessibility MathML is excluded from duplicate PDF text capture.

## Supported source

Inline: `\(...\)` or unambiguous `$...$`. Display: `\[...\]` or `$$...$$`.
These delimiters must surround supported KaTeX TeX, including `\frac`, `\sqrt`,
superscripts/subscripts, `\sum`, `pmatrix` and `aligned`. Matrix separators use
`&` (HTML source escapes it as `&amp;`), rows use `\\`.

Single-dollar numeric amounts, whitespace-bounded dollar text, unmarked TeX,
backtick/monospace code and malformed or unsupported commands stay literal.
Prefer explicit backslash delimiters where a dollar sign is ambiguous. This is
the installed KaTeX subset, not full LaTeX. Very dense expressions may need a
larger authored box to stay readable; arbitrary TeX cannot be guaranteed to fit
an arbitrarily small fixed rectangle. No formula source is discarded.

## Observed verification (2026-11-02)

The final branch is based on main `04974b12` (#632), with #629's loading changes
retained. No sidebar/WorkspaceChrome files from #628 were changed.

- `node --test scripts/slides-editor.test.mjs`: **16 passed**, including the six
  focused math regressions imported into the existing CI owning check, compiler
  save/reopen semantics, all original archive/format/style checks and editor
  build. The font regression checks all 20 distinct faces and intact KaTeX base
  typography, rather than just the presence of some WOFF2.
- `npm run typecheck`: passed. Source-scoped `git diff --check -- scripts
  third_party`: passed. The raw downloaded `sample.html` retains upstream CSS
  keyframe trailing spaces, so the complete evidence diff is not whitespace
  clean; the downloaded bytes and their recorded hashes are preserved.
- `python scripts/check-slides-math.py`: passed with real Chromium
  **154.0.8037.57**, the product's opaque sandbox iframe and deterministic
  in-memory API fixtures. `browser.json` records seven formulas on synthetic
  page 1, no page errors, one saved edit, actual fullscreen, source preservation
  across reload, and a separate read-only preview. Main/Math/Size3 KaTeX faces
  were confirmed loaded. Editing exposes source, with no KaTeX DOM in the edit
  surface or saved HTML. Amounts, code and invalid TeX remain literal.
- Page 3 additionally checks a 20-term sum, a 4×4 matrix in a narrow text box and
  the same matrix in a padded table cell. Internal `.base` bounds and scroll
  widths stay inside available content bounds. `long-wrapped.png` captures it.
- HTML: actual downloaded `sample.html` opens with all subsequent requests
  blocked, has ten math elements across three pages, and no external editor
  font URLs. `html.png` shows the exported first page.
- PDF: actual downloaded `sample.pdf` was rasterized with Poppler and visually
  inspected (`pdf-page1.png`); fractions, stretch matrix parentheses, sums,
  aligned rows, code and CJK/English text are visible.
- PPTX: it is the **first** export after opening, exercising its own capture
  initialization. ZIP/XML inspection confirms a picture on math page 1, native
  text on plain page 2 and preserved speaker notes. `pptx-page1.png` is its exact
  packaged picture. LibreOffice Impress opened and converted the actual PPTX;
  `pptx-libreoffice-page1.png` records the rendered first page. It is not native
  editable PowerPoint math. No Microsoft PowerPoint client was tested.

`export-inspection.json` records downloadable file hashes and byte counts.
Browser source and saved files are `fixture.html` and `saved-files.json`.
Other screenshots cover editing, reopen, read-only preview and fullscreen.

Independent read-only review found and corrected intermediate failures:
an early return in PPTX measurement, narrow/padded formula overflow, the `mono`
enum, missing table rendering, currency swallowing later delimiters, minified
CSS font-declaration boundaries, and class-selected export font pruning. The
checks remain and were rerun; no failed test was removed to hide a defect.
The browser policy blocks direct data-URL navigation; offline HTML was therefore
served as a deterministic HTTPS fixture with all other requests blocked.

The added renderer increases initial editor JavaScript gzip from 1,122,881 to
about 1,201,400 bytes; this is a build-size observation, not a load-time claim.
Lazy export libraries, local fonts and #629's loading changes remain in place.

## Reproduce

```sh
npm ci
node --test scripts/slides-editor.test.mjs
python scripts/check-slides-math.py
soffice --headless --convert-to pdf --outdir /tmp/slides631-final docs/evidence/issue-631/sample.pptx
pdftoppm -f 1 -singlefile -scale-to 1200 -png /tmp/slides631-final/sample.pdf docs/evidence/issue-631/pptx-libreoffice-page1
```

Python Playwright, Chromium at `/usr/bin/chromium`, Poppler and LibreOffice are
required for their respective checks. For the baseline comparison, build
`2b33a54c` in `/tmp/lingxi631-baseline` and run the browser script with
`--baseline`. All fixture requests are local deterministic routes; no production
account, model, database or deployment is exercised.

No production writes or deploy were performed by this worker. The designated
integrator owns merge/deploy. Remaining acceptance: the affected original deck,
actual production account workflow, additional browsers and Microsoft
PowerPoint. No unsupported export format is being advertised as newly supported.
