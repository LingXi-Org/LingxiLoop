# Remaining startup work

Refs #377. This follow-up starts at `b682fdc95c379500e3f46fcb886c617a6390e110`
(the authored-vendor change in PR #428) on a separate branch. It completes two
additional concrete gaps found in the existing resource and retained-page owners.
It does not alter the chat-body path, source-message admission or iframe isolation.

## Implemented gaps

**Simultaneous cold cards downloaded the same fixed public resources repeatedly.**
The completed-byte cache could not help pages starting before the first request
finished. A deferred regression reproduced two loads for two pages and three for
three pages with the same allowed resource name and hash.

`public-resource-cache.ts` now lets those pages await the same verified public
result. The request owner keeps its own capability and cancellation signal;
followers never receive a capability, document or personal state. Each follower
cancels independently. Owner failure or cancellation sends a follower through
its own original loader once. Waiting is capped at five seconds, matching the
existing resource idle interval, so a stalled owner cannot consume another
page's entire startup deadline. The fallback neither restarts sharing nor resets
the original deadline or bounded GET recovery. Pending registrations are bounded
by `maxEntries`; the completed-byte LRU and byte budget remain in force.

Page creation and the fresh authorized state GET still happen separately for
every card. Their successful completion still gates mounting. Only allowlisted,
hash-verified public resource bytes can be reused; version changes, unknown
resources and absent/invalid hashes keep independent reads.

**Leaving a card during startup left its unused resource/state reads and guest
initialization running.** Last-anchor cleanup only made the retained owner
invisible; the normal five-minute retention policy did not cancel this work.
`retainedPage.ts` now uses the existing suspension/disposal path when the last
anchor stays unbound while the snapshot is still loading. A microtask allows
synchronous layout cleanup/setup to replace an anchor without restarting it.
Ready guests, ordinary offscreen scrolling and same-commit anchor replacement
keep their existing reuse behavior. Disposal aborts the existing initialization
controller; no extra lifecycle, authorization or server protocol was introduced.

## Focused regressions

The public-cache regression failed before implementation (two/three loads) and
passes after it (one load). Its five aggregate tests cover successful sharing,
independent cancellation, owner cancellation/failure, digest mismatch, a single
fallback, the exact five-second wait boundary, pending capacity, completed LRU,
oversized responses and private/version isolation. Scoped Biome lint passed.

```sh
node --import tsx --experimental-test-module-mocks --test --test-force-exit --test-concurrency=1 src/features/chat/visualize/web/public-resource-cache.test.ts
```

The abandoned-startup regression failed before implementation: the old core was
disposed zero times instead of once. Four lifecycle tests and two existing SDK
context tests passed afterward. They cover initial offscreen deferral, leaving
and returning during startup, ready-page reuse, ordinary scrolling and synchronous
anchor replacement. Three existing real-host tests also passed for cancellation,
state failure and the mounting barrier. Scoped Biome lint and diff checks passed.

```sh
node --import tsx --experimental-test-module-mocks --test --test-force-exit src/features/chat/visualize/zcode/gen-ui/adapters/retainedPage.test.ts src/features/chat/visualize/zcode/gen-ui/adapters/context.test.ts
node --import tsx --experimental-test-module-mocks --test --test-force-exit --test-name-pattern='initialization cancellation|resource completion cannot expose|failed first state read' src/features/chat/visualize/web/host-preparation.test.ts
```

## Controlled browser result

The existing performance fixture ran through official `@e2e-dev/web`, Chromium
153.0.8010.12, Linux, 1280×900, DPR 1. The baseline source override uses the exact
commit above. The candidate was the changed working tree on that commit, so the
raw `candidateHead` field still identifies the base rather than a release commit.
Each variant ran the same four focused observations once. These are raw local
samples, not percentiles or a production percentage improvement.

The static sample has no injected delay. The three-card and warm-page samples
inject 300 ms into each resource and state response. Public hashes are present.
After timing the first card, the fixture waits for all three cards to be ready
before measuring a separate warm page and retained return; this wait is outside
the first-card clock. An initial diagnostic baseline exposed that previously
missing settlement step. The corrected baseline and candidate below use the
same fixture, with no budget changes.

Timings are milliseconds from opening the saved, delivered fixture. “Content”
uses the fixture's SVG paint observation; SDK readiness and the real button
update are separate measurements.

| Scenario | Content before → after | SDK ready before → after | Control effective before → after | Unchanged content / ready / control budget |
| --- | --- | --- | --- | --- |
| Normal cold static | 276.2 → 295.4 | 288.9 → 307.3 | n/a | 900 / 950 / n/a |
| First visible of three cold interactive cards | 1403.3 → 1104.3 | 1391.3 → 1132.7 | 1561.6 → 1282.3 | 2400 / 2600 / 2800 |
| Warm resources, new interactive page | 454.3 → 473.3 | 443.8 → 471.1 | 592.0 → 625.6 | 850 / 850 / 1050 |
| Return to retained interactive page | 60.8 → 80.4 | 19.9 → 26.7 | 115.8 → 131.6 | 180 / 100 / 300 |

All budgets passed in both variants. Candidate click-to-update times were 20.5,
19.8 and 18.8 ms, within the unchanged 100 ms operation budget. Small increases
in the static/warm/retained samples are reported rather than hidden; one sample
does not establish their distribution.

The deterministic three-card cost fell from **18 resource GETs / 3,922,161
transferred bytes to 6 GETs / 1,307,387 bytes**. Both variants initialized three
guests and kept separate page creation/state requests. The fixture uses six
fixed resources per card; it does not need D3 or calendar. Warm-page creation
used no resource GETs. Retained return used no resource GETs or new guest
initialization, kept the original frame identity and the previously clicked
count of 1, and the next real click updated it to 2.

Evidence: [before timings](remaining-startup/before/timings.json),
[before runner result](remaining-startup/before/report.json),
[after timings](remaining-startup/after/timings.json),
[after runner result](remaining-startup/after/report.json).

## Scope decision

The two identified implementation gaps are complete. There is no additional
known implementation item being deferred from this pass. The capture-library
candidate was rejected: the installed library is 20,562 bytes (6,702 gzip);
delaying its initialization retains the source and adds trusted assembly
complexity for negligible measured initialization work. Capture and SDK source
remain unchanged and need no new export acceptance matrix.

Generation-time early preview remains optional. The current delivered assistant
reference, source message, run, agent and path checks are the authorization
contract; removing the frontend pending state would not be a valid loading fix.
The browser evidence above covers saved/delivered synthetic content. Publishing
and a finite deployed journey check remain the integrator's completion steps,
not an open-ended request to prove every conceivable scenario.

Reverting the public pending-read reuse and the last-anchor loading cancellation
restores the earlier behavior. No persisted data, schema, CSP or network policy
change is involved.

## Finite release closeout

**Code status: no known implementation gap remains from this pass.** Do not
hold this issue open for an undefined full-device/full-network matrix or for
the optional generation-preview architecture. Merge PR #428 before this
follow-up and publish through the parent thread's designated sole integrator.

After the exact release is healthy, use an authorized synthetic course and
fictional content for one bounded browser pass:

1. Generate one simple interactive visualization. Record submission, tool save,
   delivered reference, first real content and one successful control operation.
   Confirm matched readback and one source-authorized card/iframe. Distinguish
   model-generation time from saved/delivered host startup; no private student
   content or broadened draft visibility is needed.
2. Open that saved page cold, then open a second page with warm resources. Check
   meaningful content and a real control against the existing normal/warm
   budgets above, plus the 100 ms click-to-update bound. Confirm each new page
   still has its own page admission and authorized state read.
3. In the same pass, open the small three-card synthetic conversation, switch
   away after readiness and return, then expand/collapse the first card. Check
   the existing three-card and retained budgets, unchanged input/count and frame
   identity. Leaving a still-loading card should cancel its work; returning to
   that unfinished card may correctly create a fresh instance.

Retain one compact trace with the release SHA, raw stage values, public resource
counts and outcomes. These observations are not production percentiles. If they
pass, mark the concrete loading/resource/lifecycle work complete and close #377
with the explicit generation-time observation. If one fails, identify its exact
phase, request and failed existing criterion; hand off that concrete defect for
repair instead of requiring another all-scenario proof. Do not change budgets,
extend initialization deadlines or bypass source/state authorization to pass.

## Reproduction and check environment

The existing fixture now accepts an explicit baseline ref and the four-case
startup subset. Run each variant once; the original larger matrix is unchanged.

```sh
PLAYWRIGHT_BROWSERS_PATH=/workspace/browser-cache E2E_TELEMETRY_DISABLED=1 E2E_VISUALIZE_377_BASELINE=1 E2E_VISUALIZE_377_BASELINE_REF=b682fdc95c379500e3f46fcb886c617a6390e110 E2E_VISUALIZE_377_STARTUP_ONLY=1 E2E_VISUALIZE_OUTPUT=.e2e/377-remaining-before-settled npx --no-install e2e run --config e2e.visualize-377.config.ts
PLAYWRIGHT_BROWSERS_PATH=/workspace/browser-cache E2E_TELEMETRY_DISABLED=1 E2E_VISUALIZE_377_BASELINE_REF=b682fdc95c379500e3f46fcb886c617a6390e110 E2E_VISUALIZE_377_STARTUP_ONLY=1 E2E_VISUALIZE_OUTPUT=.e2e/377-remaining-after npx --no-install e2e run --config e2e.visualize-377.config.ts
```

The first baseline's incomplete-card timing remains in
[initial observation](remaining-startup/initial-observation/timings.json). Two
other cards initialized after navigation into the warm case. The corrected
fixture waits for readiness outside the first-card clock so the retained test
does not accidentally demand preserving abandoned startups.

The first full build found two incomplete TypeScript fixture casts in the new
retention regression, not product-source errors. Its
[failure log](remaining-startup/build-initial.log) is retained. The fixture was
corrected to supply complete observer records and typed service/platform stubs.
The focused browser config/test typecheck and three-file fixture lint passed.

After the fixture correction, `npm run build` passed, including fixed-source
verification, official guest generation, Web/Node typechecking and Vite
production bundling. [Final build log](remaining-startup/build-final.log) and
[source hashes / unchanged-budget checks](remaining-startup/summary.json) are
retained. No independent review or production operation was run.
