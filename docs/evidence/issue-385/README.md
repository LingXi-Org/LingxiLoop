# Forum math and edit roundtrip (#385)

Baseline: `784a6f1b0822eaf6646462e0972883109a90f5d0`, including merged #380.
All posts, identities, screenshots and API writes here are synthetic, in a disposable
local database. The issue provides no original post/document; these are confirmed
code-path reproductions, not confirmation of the reporter's exact stored content.

## Causes and bounded changes

1. Native BlockNote 0.56.0 Markdown paste does not include a math parser. Pasting
   mixed forum Markdown saved dollar-delimited formulas as ordinary text while
   code and Mermaid remained native blocks. Feed Markdown rendering and the native
   detail reader then disagreed. Both teacher and student detail views reproduced
   **zero math elements**, where two were expected.
2. Editing old Markdown converts it to native blocks. In the detail card's
   `items-start` flex container, `.content-document` had no width, so the body
   shrank to its intrinsic width: **274.03125px inside 768px**. Its quote/table/math
   blocks survived but appeared in a narrow column. Setting the reader to 100%
   width gives **734px inside 768px**, accounting for card padding and borders.

The forum paste adapter reuses the existing currency-safe Markdown/MathML import
and official `editor.pasteHTML`. Inline MathML's explicit `display="inline"`
normalization now runs after KaTeX in the shared HAST pipeline. There is no new
math renderer, schema, dependency, serializer or persistence format. Existing
VS Code code serialization remains outermost; native clipboard HTML, rich HTML,
files, code selections and case Markdown retain their existing handling. Forum
raw HTML is still skipped and KaTeX trust remains disabled.

The installed upstream sources are `@blocknote/core` and `@blocknote/math-block`
0.56.0: `api/parsers/markdown/markdownToHtml.ts`,
`api/clipboard/fromClipboard/pasteExtension.ts`, and
`inlineContent/helpers/parse/parseInlineMathMLElement.ts`. The latter requires
the explicit inline display attribute and restores the original TeX annotation.
Public APIs are used; installed packages are unchanged.

## Verification

- Six focused unit tests pass: two new paste-policy/math tests and four existing
  #380 code/import/escaping tests.
- Two official `@e2e-dev/web` tests pass against the actual HTTP routes and isolated
  PostgreSQL, with synthetic teacher/student identities. They cover mixed math,
  code, Mermaid, quote, nested list, start number 3 and table; new publish;
  legacy edit/save; reload; exact stored formula/code text; identical native
  JSON and block IDs after a second save; title update through the real API;
  teacher/student detail reading; and no horizontal viewport overflow at 390px.
  The share composer exposes body editing only, so the title update is explicitly
  an API step, not an asserted UI title-control flow.
- Web typecheck/build, focused E2E typecheck, changed-source lint and diff check
  pass. Build retains existing CSS/chunk warnings. No full-suite or cross-browser
  success is claimed, and no model qualification test was rerun.
- The initial two-scenario baseline failed both expected application assertions;
  the candidate passed both, then the expanded persistence/mobile assertions
  also passed. Earlier fixture setup/selector mistakes are separately recorded
  in [checks.json](checks.json), not counted as product failures.

Local results and tested source hashes are in [checks.json](checks.json).
The official engine used installed Chromium via its public CDP connector.
No Playwright import or persistent permission grant was used.

## Reproduction and limits

Use the isolated services described in [the forum fixture guide](../../../e2e/forum/README.md)
and `e2e/forum/api.ts` (API 53097 / Vite 53098). This workspace reused the fixture
launcher with private database/Redis ports 55434/56381 and retained its services
while selecting only the new config:

```sh
E2E_TELEMETRY_DISABLED=1 e2e run --config e2e.forum-math.config.ts
node --import tsx --test src/features/content-editor/paste.test.ts src/features/content-editor/code-block.test.ts src/features/cases/CaseCodeBlock.test.tsx
```

**Stored native JSON whose formula is already ordinary dollar-delimited text is
not automatically rewritten.** It still uses the canonical native blocks. This
avoids guessing whether literal text was meant as math. The fix covers new plain
Markdown paste and editing legacy Markdown, not automatic recovery of every old
native document. An affected old native formula can be explicitly reinserted by
its author using the native formula tool or the corrected Markdown paste path.
The original report's input route and stored representation remain unverified;
the integrator should retain that acceptance boundary when closing the report.

Native typography is retained; pixel identity with the legacy Markdown renderer
is not claimed. Real gateway authentication, other browser engines and production
acceptance are outside this isolated run. The sole integrator owns merge/deploy.
No API/contracts, migrations, homework publishing, runtime or permissions changed.
Rollback is a product-code revert, with no data migration to reverse.

## Synthetic screenshots

- [Baseline formulas displayed as source](before-math.png)
- [Baseline post-edit body shrink](before-width.png)
- [Fixed teacher detail](after-teacher.png)
- [Fixed student mobile detail](after-student-mobile.png)
- [Fixed detail after edit and reload](after-reload.png)
