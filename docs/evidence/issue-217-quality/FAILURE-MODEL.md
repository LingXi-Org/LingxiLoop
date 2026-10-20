# #217 numerical content follow-up — before implementation

Base: `754cd873e3b96308ae6e18b93eca57c485a9bbb3`. Original acceptance at
`7344210a` and both issue comments read on 2026-10-20. Scope is generated
content, not the deployed card/UI/loading work.

Failures to retain and test:

1. Correct plotted functions but independently hard-coded, incorrect annotations.
2. Correct numeric operands but reversed recommendation/inequality branches.
3. Derived-series differences accidentally use the source series' previous value.
4. Final prose disagrees with the chart, or confuses absolute and relative change.
5. An LLM verifier makes its own arithmetic error. Storage hashes, a complete
   reference, `succeeded`, and a readable screenshot are not numeric oracles.
6. A correction passes only the initial view, not input changes, both sides of a
   threshold, tie/rounding cases, decreasing observations or negative deltas.
7. Read-back is skipped or truncated, so the authored artifact is never reviewed.
8. Provider budget/timeouts or incomplete output are hidden by a fallback, retry
   cherry-picking, skip-as-pass, or fabricated fixed answers.
9. The bounded follow-up exposed two delivery-contract failures: full documents
   are rejected by the fragment-only save boundary but surfaced as an unknown
   transaction failure; a successfully saved chart can be emitted only inside a
   code fence and silently omitted by the existing reference parser. Preserve
   rejection and code-example semantics; return actionable input feedback and
   detect a final answer consisting only of a code-wrapped reference to a
   current-run saved visualization. Do not require every save to be embedded:
   exporting a revised fragment or an honest text fallback remains valid.
10. A broad missing-reference check would reject save → export → artifact-only
    replies. Independent review caught this before publication. Restrict repair
    to the observed code-only answer, using the installed Markdown parser and
    unchanged ZCode reference parser; keep prose/examples/export replies valid.
11. A distinct new attempt could reuse an old output directory and overwrite its
    results after a paid call. Require a fresh output directory before ingress.
    Existing initial/repair1 evidence is intact; do not retest this with a model.

Recompute from the unchanged synthetic inputs, independently of the generator:

- `A(n)=100+2n`, `B(n)=5n`; equality gives `n=100/3`, cost `500/3`.
  At 20 uses choose B (100 vs 140); at 50 choose A (200 vs 250).
- Revenue `[12,18,17,25,31,40]`, costs `[8,11,12,15,17,20]`;
  profit `[4,7,5,10,14,20]`, profit deltas `[3,-2,5,4,6]`,
  revenue deltas `[6,-1,8,6,9]`. Largest absolute increases both occur in
  month 6; largest percentage increases occur in month 2 for revenue (50%)
  and month 4 for profit (100%).

The original comparison source has SHA-256
`980ecb22cabedd1be0eef4e2ed82f92bb2df492b0fba40cf515c9ac2599f3a03`.
It computes `cy=500/3` but prints `约 500 元`, and reverses both
`a<b`/`b<a` recommendation strings. Original trend source SHA-256
`d9961e4cc3f20f5dceff0743937842e1f3ae2cc7007f0b226feb444d4c412edd`
uses `profit.map((p,i)=>i?p-sales[i-1]:null)`, producing
`[null,-5,-13,-7,-11,-11]`. These hashes match the original dedicated DB.
The original runtime verifier also incorrectly called month 4's +5 the largest
profit change; its red result is evidence, not the answer key.

Plan: preserve original rows/files and failing official-browser assertions.
Add a general product authoring/read-back contract outside immutable upstream,
without case-specific answers, a new parser/protocol, unsafe evaluation or
expanded runtime permissions. Run only the two affected real-provider cases
with explicit budgets, then inspect and assert the actual completed output in
the official sandbox. Keep partial/failed runs visible. No historical rewriting,
production writes, deployment, package publication or closure.
