# #259 — first visible card dependency waterfall

Based on fetched main `c66e847d14f838e72d0ab19e252e6cd4e2b68a76`.
The product patch only changes `web/document.ts`: start the vendors actually
declared by the returned kit/fragment when the kit arrives. Previously those
reads waited for unrelated CSS, runtime and calendar responses too. All reads
still finish before document assembly/mount, and script execution order stays
identical. There is no speculative fixed-vendor prefetch or new cache.

## Traced first-open path and remaining uncertainty

| Stage | Actual code path / finding |
| --- | --- |
| Save → delivery | `saveVisualizeDocument` authorizes and locks, synchronizes the filesystem mirror, then writes PostgreSQL. The native save verifier reads back the authorized DB document. The page acquisition still requires a completed assistant message referencing that document/run. This work precedes the timed browser fixture; production save/delivery duration is unavailable. |
| Page/content | `createVisualizePage` checks actor, DB document, delivered reference, current version, quota and creates a fresh capability plus state snapshot. `readDocument` in the Web host is a local placeholder; it does not introduce a separate HTTP document read. The POST supplies complete HTML. |
| Manifest/resources | Every authorized resource read loads runtime/vendor manifests (plus built manifest for `gen-ui.js`), checks allowed path, reads/hash-checks bytes, then rechecks the page. Responses are `no-store`. These checks remain unchanged. Local fixture timing includes controlled HTTP transport, not production DB/disk timing. |
| Dependency barrier | Before: `max(css, kit, runtime, calendar) + vendors`. After: `max(css, runtime, calendar, kit + vendors)`. Only dependencies declared in complete content are requested, once each. This is the proven removable wait. |
| Fresh state | `getState` still runs after complete preparation; revision projection and late-result guards remain in place. No stale state cache or skipped authorization. |
| iframe / SDK | Same opaque outer shell and `allow-scripts` inner iframe, CSP, original guest, official MCP Apps SDK, message source binding, private port, and initialization budget. The trace records outer/inner creation, SDK init and content size. |
| Retention / retry | One cold visible card, no offscreen cards or prior retained guest. One page and eight resources in both before/after. Retention, attempt identity, cancellation, local release and retry are untouched. |

The user-reported whole production delay is **not yet established as solved**.
In particular, slow save/delivery, database authorization, bandwidth, a slow kit,
and iframe parsing can still dominate. No production credentials were requested
or copied. The request to the sole integrator for sanitized timings could not
be delivered through the unavailable desktop tunnel; production timing remains
an explicit handoff item, not a prerequisite invented for this narrow fix.

## Finite deterministic result

Official `e2e` 0.17.0 / `@e2e-dev/web` 0.12.0, Chromium 153.0.8010.12,
1440×960, one newly opened card, no-store transport, complete acceptance HTML.
Per-request delay: runtime 1200ms, each vendor 500ms, others 40ms. No model calls.
First content observation means SDK initialized, nonempty content-size notification,
visible frame and two animation frames; real guest DOM and controls are checked
afterwards. Screenshot/runner capture is outside the timed interval.

| Relative to entry (ms) | Before | After |
| --- | ---: | ---: |
| Page/content response | 38.6 | 49.4 |
| Kit response | 83.8 | 96.8 |
| Runtime response | 1265.9 | 1255.6 |
| First vendor request starts | 1291.2 | 98.9 |
| Last vendor response | 1797.6 | 604.9 |
| Latest state response | 1819.8 | 1259.1 |
| iframe observed | 1842.4 | 1277.0 |
| SDK initialized | 2170.9 | 1591.7 |
| First visible sized content + two frames | 2196.2 | 1606.8 |

One paired sample: **589.4ms / 26.8% earlier**, with the unnecessary resource
waterfall directly proven by request ordering. This is neither a production
percentile nor reuse of the previous one-visible/five-offscreen benchmark.
The baseline fails the ordering assertion after recording its timing and usable
content; the candidate passes. Both use one page and exactly eight resource reads.
D3 renders three rectangles and the real play button changes state successfully.

Additional bounded checks:

- Slow kit (kit 1200ms, runtime 40ms): passes; vendors correctly wait for their
  declaring input. Content observed at 2156.4ms, demonstrating the limit of this fix.
- Existing held-resource / 15s deadline / retry with held DELETE: passes. Four
  blocked reads abort; recovered guest works; cleanup leaves one active page.
- Full Web lint passes with existing warnings; owning file lint passes cleanly.
- Scoped TypeScript check of the builder, fixture, test and config passes.
- Pinned upstream asset verifier passes all 223 files; original guest build passes.

Full Web and full E2E type checks are **blocked**, not passed: fetching locked
`@lyyzka/lingxios@3.6.0` from GitHub Packages returns 401. The preexisting
`server/node_modules` has 3.5.2 and full E2E type checking also encounters those
incompatible types. Verification used a temporary Web-only install with that
private package omitted, all other locked dependency versions retained, and no
repository manifest/lock changes. Full Web test/build and independent review
remain for an authorized integration environment; no older runtime was substituted
for product validation. See raw typecheck logs for exact errors.

## Reproduction and evidence

With the repository's pinned dependencies and built guest available:

```sh
npm run build:visualize-runtime
E2E_TELEMETRY_DISABLED=1 PLAYWRIGHT_BROWSERS_PATH=/workspace/e2e-browsers \
  E2E_VISUALIZE_OUTPUT=.e2e/259-after \
  node_modules/.bin/e2e run --config e2e.visualize-first-card.config.ts
# Repeat with E2E_VISUALIZE_SLOW_KIT=1 for the actual dependency gate.
E2E_TELEMETRY_DISABLED=1 PLAYWRIGHT_BROWSERS_PATH=/workspace/e2e-browsers \
  E2E_VISUALIZE_OUTPUT=.e2e/259-resource-retry \
  node_modules/.bin/e2e run --config e2e.visualize-timeout.config.ts --grep 'covers resources'
cp perf/issue-259/evidence/scoped-tsconfig.json .e2e/259-scoped-tsconfig.json
node_modules/.bin/tsc -p .e2e/259-scoped-tsconfig.json
```

For the baseline, restore only `web/document.ts` from the stated main commit in
a disposable checkout, retaining the regression test/fixture config.
[Raw timings, reports, synthetic screenshots and checksums](evidence/) are
committed; full trace ZIPs remain in the local `.e2e/259-*` directories. None of
these screenshots is the user's Library screenshot.

Only issue/code/draft PR delivery. No merge, deployment, issue closure, changes to
403/streaming logic, production data writes or paid model calls.
