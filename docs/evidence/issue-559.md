# Agent body math — #559

Baseline: `35b64e31804716a725aee05d33fdf3354f85a0d6` (current main when work began).
Environment: latest LingxiLoop&OS cloud snapshot, Node 24.19.0; checks on 2026-10-30.

## Findings and scope

The private screenshot's source Markdown/message ID was not available. These are
synthetic equivalent samples, not a reproduction of that original message.

The actual `MarkdownText` → `StreamdownTextPrimitive` → custom `CitationBlock`
path already passes `createMathPlugin({ singleDollarTextMath: true })`. Installed
Streamdown appends the math remark/rehype plugins to the existing HTML safety
pipeline, then our custom block preserves them. KaTeX CSS is already imported in
`src/main.tsx`. Valid dollar-delimited Attention, matrix, sum and aligned samples
already render on baseline. No missing plugin or upstream parser bug was found.

Inline backticks and `latex` fences intentionally remain code, matching the
screenshot's visible symptom when the source uses code formatting. The existing
product generation rules did not specify mathematical Markdown. This change
adds that contract to the actual trusted model instructions in
`server/src/agent-runtime/context.ts`, with an Attention example, dollar
delimiters and escaped currency. It preserves explicitly requested code/source.
It does not infer that the private screenshot definitely had this cause, and a
prompt rule is not a guarantee that every model response will follow it.

Display formulas previously had no conversation-scoped overflow rule. They now
have a bounded horizontal scroll area with padding, a labelled keyboard focus
target and a visible focus indicator. No parser, dependency, unsafe HTML setting,
historical message rewrite or code-to-formula conversion was added.

## Reproducible synthetic input

```markdown
转置 $QK^{\mathsf T}$，维度 $\sqrt{d_k}$。

$$
\operatorname{Attention}(Q,K,V)=\operatorname{softmax}\left(\frac{QK^{\mathsf T}}{\sqrt{d_k}}\right)V
$$
```

Actual rendered markup from the production component has three `.katex` roots,
one `.katex-display`, one `.mfrac`, two `.sqrt` nodes and the exact Attention
source in `annotation[encoding="application/x-tex"]`; no code-block controls.
The display wrapper is focusable and labelled “数学公式”. These are semantic
markup observations, not browser pixel/layout measurements.

Covered examples also include `bmatrix`, `sum`, `aligned`, growing unclosed
prefixes, interruption, malformed `\frac{`, an unsupported command, Chinese and
English prose, code fences/backticks, escaped currency, literal backslash
delimiters, citations following formulas, and unsafe HTML/math links. KaTeX
preserves malformed source or displays the unsupported command without dropping
the rest of the message.

Syntax follows the installed upstream scheme: `$...$`, `$$...$$` (display
delimiters on separate lines). `\(...\)` and `\[...\]` are not normalized.
Literal currency uses `\$`; paired unescaped dollars are inherently ambiguous
under `remark-math` and retain that upstream interpretation. We add no guessing
rules. `latex`/`tex` fences and inline backticks retain their source semantics.

Whole-message copy continues to use Markdown source with only rendered citation
labels substituted, so these formulas retain their LaTeX and dollar delimiters.
KaTeX also retains its TeX annotation. Native selection/clipboard interaction was
not exercised in a browser.

## Verification

- Production-component SSR regressions: `node --import tsx
  --experimental-test-module-mocks --test --test-force-exit
  src/components/assistant-ui/markdown-text.test.tsx` — 19 passed.
- Existing `confidence-citations.test.ts` integration, extended with actual
  `request.instructions` assertions and inline/display math in the response —
  passed. It uses real PostgreSQL and Redis, the published LingxiOS worker,
  deterministic model responses, recording IM HTTP, committed messages and two
  authenticated reconnects; math source is preserved throughout. It makes no
  live model call. Target: dedicated synthetic `lingxiloop_test_559`, initialized
  with the repository migration command; no product/student data was used.
- `npm run typecheck`, `npm run server:typecheck`, focused Biome lint and
  `git diff --check` — passed.
- `npm run build` — passed. Existing CSS pseudo-element/dependency annotation
  warnings and bundle-size warnings remain; no new build failure.

Earlier attempts retained here for accuracy: the empty dedicated database first
failed the migration precondition; after normal migration, an initial fixture
assertion incorrectly looked for trusted rules in `request.items`. It was fixed
to the published driver's `request.instructions` field and the integration then
passed. An initial error-fallback assertion also assumed all unsupported commands
use `.katex-error`; upstream can render them inside KaTeX while preserving the
source annotation, so the check now accepts either documented readable fallback.

Reused components: `@assistant-ui/react-streamdown` 0.3.14 (MIT), `streamdown`
2.6.0 and `@streamdown/math` 1.0.3 (Apache-2.0), `remark-math` 6.0.0,
`rehype-katex` 7.0.1 and `katex` 0.16.47 (MIT). All were already installed;
no upstream code was copied or patched.

Real browser visual/narrow-screen/clipboard acceptance, the unavailable original
private message and live model adherence remain unverified. Per delegation,
this branch is handed off as a draft PR for the parent integrator's independent
review, merge, release verification and issue disposition; it does not deploy
or close the issue itself.
