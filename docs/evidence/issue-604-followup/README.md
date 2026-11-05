# Rich-text fidelity follow-up (#604, #679)

Base: `b52674a7c3d3f866a157cfdc7c198484c73c9fc0`. Re-read #604, #679 and
merged PR #687 (`4b5793ce94960ef0b38dffc9ffb87a63b9909551`). #604 remains
open; #679 is closed. This follows the existing-issue development instruction,
without waiting for another private sample or claiming that sample was tested.

## Confirmed residual and minimal change

#687's `preserveLearningOperators` parses basic CommonMark before escaping numeric
multiplication/exponent operators. The actual learning renderer/importer also
supports currency-safe math and GFM autolinks. That dialect mismatch modifies
`$2*3*4$` into `$2\*3\*4$`, and `<https://example.invalid/2*3*4>` into an
autolink containing backslashes. The new regressions failed on main for both
cases; the mixed formula/prose test also failed on changed formula content.

Use the already-installed remark parser, currency-safe math and GFM plugins to
identify protected source ranges. Preserve math, code, autolinks and reference
definitions. Explicit Markdown link labels can still preserve numeric operators.
Use that same parse dialect when comparing native text with saved evidence,
so native formulas do not trigger a false operator-disagreement fallback.

The stored text and native documents are unchanged by this helper. No new
package, parser grammar, schema, migration, credential or security-setting change
is introduced. `fenced-code.ts` and its conservative style guard are unchanged.

## Checks

- Node **22.23.4**, ten focused regressions pass: three new operator/dialect tests,
  two six-paragraph historical-shape safety cases, and five existing #604/#679
  checks. See `source-results.txt`. Changed-file Biome lint and the focused
  TypeScript project pass; `git diff --check` passes.
- Actual Chromium **154.0.8037.57**: `MemoContent`, `ContentEditor` and
  `ContentDocumentView` render the synthetic fixture. Edit, JSON save/reopen and
  inspect native content: two exact formula sources, two exact URL targets,
  original italic text and exact Python code survive. Unstyled six-paragraph
  unlabelled fences recover; styled ones retain all six paragraphs and italic
  content. Desktop 1280x1000 and a 390x844 viewport run have no page errors.
  The narrow check only verifies link presence; no broad responsive claim is made.
  Results are in `browser-result.json`. The fixture uses a JSON copy in memory,
  not server persistence, production data, live model output or a private case.
- Clean `npm ci --ignore-scripts` was blocked by GitHub Packages **401** for
  `@lyyzka/lingxios@3.8.25`. No retry with different credentials, registry bypass,
  credential change or substitute SDK qualification was attempted. Local focused
  frontend checks use the existing cached dependencies. Their parser/math/editor
  versions match this lock: unified11.0.5, remark-parse11.0.0, remark-gfm4.0.1,
  remark-math6.0.0, react-markdown10.1.0, rehype-katex7.0.1, BlockNote0.56.0.
  Cached LingxiOS is3.8.16 and is not used by these isolated checks. Full clean
  typecheck/build and exact-head CI remain separate gates. Some cached-font URLs
  were denied by the Vite local filesystem allowlist; no font/visual acceptance
  is claimed and that allowlist was not changed.

Reproduce with the repository's normal authorized dependencies and Node22:

```sh
node --import tsx --test src/features/learning/forum/learning-operators.test.tsx src/features/content-editor/fenced-code.test.ts src/features/learning/homework/answer-source.test.tsx src/features/learning/homework/fenced-source.test.ts
npx tsc --project docs/evidence/issue-604-followup/focused-tsconfig.json --noEmit
npx vite --host 127.0.0.1 --port 5197 --strictPort
# In another shell, using installed Python Playwright and Chromium:
python docs/evidence/issue-604-followup/browser.py
```

## #604 boundary and release ownership

The historical production body/editorDocument JSON and the cause of its styled
paragraphs remain unverified. DOM evidence is not promoted to storage evidence.
Canonical styled blocks cannot be safely reclassified merely because they look
like a fence: native code blocks remove formatting. This change deliberately
preserves that boundary and must not close #604 as a recovered historical case.
It fixes the independently reproduced operator/dialect residual after #687.

Independent final-head review and integration belong to the designated sole
integrator `01a19a90-dfc4-77f7-9803-e9035c481026`. No Approve, merge, production
deployment, production data access/mutation or Lenovo browser operation was
performed by this contributor. Draft PR CI and later review results should be
recorded in the PR description, without rewriting this frozen local evidence.
