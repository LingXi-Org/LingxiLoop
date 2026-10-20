# #247 bounded internal geometry construction

Base: cf4a299bcfb44d7e7ed74a250ea1404588a4e901. Failure model and deterministic cases preceded implementation. No provider, browser, production or dependency installation was used.

The frozen `artifacts/issue-217-quality/provider-repair1/comparison-answer.md` is unchanged and still fails: its shading boundary282.7 does not represent100/3 on its x70..600 axis. Optional `visualize.chart` linear `preferenceBands` now constructs partition boundaries, rect widths, intersection marks and decisions from the same input functions and plot projection. At most6 functions yield15 pair intersections and16 intervals. Display precision is0.001 SVG units; degenerate intervals and indistinguishable distinct functions at an interval midpoint are rejected. Identical functions may tie throughout. Shading describes open interval interiors, not all endpoints. Display rounding never determines a preference.

Separately, new optional `visualize.diagram` supports2–12 ordered sequence nodes and their exact adjacent forward chain. Natural document flow supplies box heights and connecting gaps; text wraps without fixed heights, truncation or independently authored coordinates. Typed text is escaped, including labels/details/edges; no supplied JS, CSS, HTML, expressions, links or external network. Arbitrary graphs, branches, cycles, spatial arrangements and arbitrary historical HTML are not validated or repaired. This is a bounded construction path; the frozen evidence is a plot band defect, not evidence of overlapping sequence nodes.

Both paths retain existing public registration, current actor/conversation/run save/read/verify/reference/export boundaries. Invalid input/cancellation does not save. Ordinary text, code examples, literal save and read/export remain valid; there is no keyword coercion or private runtime receipt parsing. No client, package/lock, schema or runtime changes.

## Short checks actually run

- Pure tests:17/17 (`visualize-diagram`5, `visualize-regions`4, existing `visualize-numeric`8).
- Existing public registry:1/1.
- Dedicated local PostgreSQL integration:4/4 (diagram2 + numeric2), schema49, independent random fixtures; Redis DB15. No historical database reset, no provider calls. The diagram path checks actual persisted readback/hash, invalid edges, abort, wrong run and revoked membership.
- `npm run server:lint`, `npm run server:typecheck`:passed.
- Logs include initial red, optional-label red, and independent midpoint-cancellation red before fixes, followed by green owning checks.

Reproduce pure checks with Node22 and existing dependencies:

```
node --import tsx --test server/src/__tests__/visualize-diagram.test.ts server/src/__tests__/visualize-regions.test.ts server/src/__tests__/visualize-numeric.test.ts
npm run server:lint
npm run server:typecheck
```

Database checks require the existing repository test environment and a dedicated test database; no credentials are included in this evidence. Original25 provider calls remain red/unresolved as originally recorded. No claim of model selection, end-to-end complete delivery, arbitrary HTML correctness, browser readability, or #247 fully resolved. Public activation/delivery obligations remain a separate upstream PR38 and subsequent product integration.

Independent read-only review (`pr237_review/numeric_review`) confirmed midpoint precision P2 via a separate pure reproduction, then confirmed fail-closed fix and preserved coincident-function ties. Final review found no remaining P1/P2 in this bounded slice; reviewed source geometry, text escaping, cancellation/auth/save/readback boundaries and diff whitespace. Reviewer did not run provider/browser/DB checks.
