# Saved visualization button locator

## Failure model

The generated two-stage resource keeps the visible button text `Switch stage`,
but supplies an accessible name with its current state, for example
`Switch stage. Currently showing Gather.`. An exact accessible-name selector
for `Switch stage` therefore rejects a valid control before attempting a click.
The visible label, stage headings, descriptions and both transition directions
must remain mandatory; accepting arbitrary button names or dropping assertions
would conceal an actual interaction defect.

## Existing evidence

The original local synthetic qualification failed at the first button lookup in
`provider-342.e2e.ts`, after its initial heading/description assertions passed.
The saved HTML, failure screenshot and accessibility snapshot independently
showed the visible label and state-qualified accessible name. The original
qualification report remains failed and has not been overwritten.

A separate official `e2e` 0.17.0 diagnostic reused that exact saved resource,
accepted IM history and the product renderer/resource authorization APIs. It
accepted only the bare button name or its Gather/Check state suffix, while
checking the exact visible text at all three stages. The actual browser test
passed **1/1 in 13.67 seconds**, exit 0, with screenshots for:

1. `Gather` / `Collect the items.`
2. `Check` / `Review the items.`
3. `Gather` / `Collect the items.`

Diagnostic output is retained in the isolated qualification workspace under
`.e2e/issue366-saved-graph-browser-diagnostic/` (`output/summary.md`,
`output/report.json`, screenshots and `integrity-browser-report.json`). Ten
business tables and thirteen original graph/arithmetic evidence files retained
identical before/after hashes. The browser added one normal preview capability
record and updated the existing temporary stage UI state. No model request,
Worker execution, task replay or production operation occurred. Two preliminary
runner setup failures executed no tests; their separate logs remain retained.

This is a locator correction, not an overall qualification pass. The independent
first-useful-answer condition remains unmet: model round 2 instead of required
round 1. No new provider or browser run is needed to transfer this already
verified selector and its exact-label assertions into the owning test.
