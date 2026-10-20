# #244 normal startup: prioritize visible history

The product change is confined to `retainedPage.ts`: a cold owner waits for its
existing IntersectionObserver's first visibility result. Visibility is rechecked
before/after the asynchronous release and capacity reservation. Ready retained
cores continue binding immediately. The loading/error/retry states, complete
document execution, permission checks, fresh state read, revision ordering and
resource assembly are unchanged.

This follows the separate wait/retry fix in PR #250, final candidate
`39878f35de1f84952d8f5c91cffe77dc0763ad55`. Its predecessor `e49a865` had a
late-create retry race; that is fixed in the final candidate and must not be
integrated alone. PR #252's layout baseline is
`62b6a19a4decbfe815ea5678a606baa086c0a6ac`.

## Actual production-path cause

`retainedPage.bind` previously marked every new anchor visible and immediately
called `ensure`, before IntersectionObserver could report offscreen history.
The retained page manager permits **64** active pages. A mounted history can
therefore start many page acquisitions, eight resource requests per complete
D3/calendar card, document builds and opaque iframe initializations at once.

This is not just additional loading placeholders: each real resource endpoint
performs page/tenant/project/version authorization before and after reading and
integrity-checking the requested file. Those checks remain necessary and intact.
Avoiding an unseen page's initial acquisition avoids the entire unused path.
No cache key or authorization boundary was broadened.

## Short paired result

Same source fixture, 1440×960 Chromium, official `tester-army/e2e` 0.17.0 and
`@e2e-dev/web` 0.12.0, no-store local transport, 250ms delay per resource. Six
complete historical references are mounted; only the first is in the viewport.
The other five are separated by fixed space representing intervening messages.
No provider or production account is involved.

| Entry → first actual content | Before | After |
| --- | ---: | ---: |
| One visible + five offscreen | 4,808.4ms | 1,265.6ms |
| Page acquisitions at first paint | 6 | 1 |
| Resource requests at first paint | 48 | 8 |
| Created guest iframes at first paint | 6 | 1 |

One paired observation, not p75/p95 or a production speed claim. The deterministic
request/frame reduction identifies the removed work; the observed first paint
is 3.54 seconds earlier in this fixture. The original baseline test fails and
its timing, screenshot and failure are retained unchanged.

The endpoint is official SDK ready plus a nonempty content-size notification,
visible frame, and two animation frames. Real guest controls are then clicked.
The after case also scrolls directly to the last card, confirms it loads and
responds, resizes to 390×844, and returns to the first card. Its local control
state is preserved. Exactly two pages and 16 resources exist after this sequence;
the middle four remain uninitialized. No denied requests occur in this fixture.

## Necessary regression

- Offscreen case: one red → one green.
- Three simultaneously visible cards: cold / switch / retained return / reentry
  passed. First paint respectively 2689.7 / 2123.3 / 31.9 / 26.2ms. Cold and switch
  still fetch 24 resources; return/reentry fetch zero. This is a regression check,
  not evidence that three visible cards got faster.
- Held resources → 15s error → retry while cleanup is held: passed again with
  this visibility gate. The complete original SDK guest recovers and works.
- Web and E2E type checks, owning lint and immutable upstream verifier are
  recorded alongside the browser artifacts.

## What the stage traces do and do not explain

Before this scheduling change, three single-card traces with the same 250ms
resource delay showed: page response 18–49ms from entry; last resource response
545–573ms; fresh-state response 558–592ms; observed frame 608–647ms; SDK initialized
885–1171ms; first paint 923–1212ms.

A second trace added test-only document-creation timestamps in all frames.
Initial about:blank creation→load was under 1ms. Srcdoc navigation and full inner
HTML/runtime parsing varied heavily with shared-cloud scheduling. This does not
justify speculative blank-iframe prewarming, so none was implemented.
The old vendor-prefetch experiment also remains rejected.

Resource loading still uses two dependency waves: CSS/kit/runtime/calendar,
then the kit/fragment's known vendors. Every page needs the current scoped
capability; the router sends no-store. There is no new shared resource cache.
Generated HTML is complete before any guest is mounted. Single-card startup and
multiple **visible** cards still pay their full runtime and sandbox startup.

The remaining next measurable cause is the builder's dependency barrier:
vendors wait for *all* initial resources, not just the kit that declares them.
If real transport timing shows a slow runtime response, starting only the
already-declared dependencies as their inputs arrive may overlap that wait.
The prior fixed-vendor prefetch did not prove improvement; no second speculative
patch is included. Actual production timing with remote permissions/network is
still unavailable here; this result cannot explain every reported long wait.

## Reuse and limits

The unchanged upstream source is ZCode MIT, commit
`0a1fc56d279fd1001f78387bd81aec1c26767411`. The actual retained owner/controller,
GenUiCard, original built genUi runtime, kit and assets remain in use, with the
official MCP Apps SDK (`@modelcontextprotocol/ext-apps` 2.0.0). Only Web product
admission timing changed; no parser, stream protocol or guest runtime was added.

The test-only diagnostic messages carry timestamps and are accepted only by the
test recorder, never by a product capability handler. The product diff introduces
no new message format.

No paid model calls, production data writes, real-device/clipboard retries,
merges, deployments or issue closures. #246 generated internal SVG/box-coordinate
failures are separate from the public host zoom correction; generic generation
guidance cannot guarantee arbitrary authored geometry and #247 owns that work.

Reproduction:

```sh
E2E_TELEMETRY_DISABLED=1 \
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/e2e-browsers \
E2E_VISUALIZE_RESOURCE_DELAY=250 \
E2E_VISUALIZE_OUTPUT=.e2e/244-offscreen-repro \
node_modules/.bin/e2e run --config e2e.visualize-offscreen.config.ts
```

See [failure model](STARTUP-FAILURE-MODEL.md) and the complete
[raw artifacts](../../artifacts/issue-244-startup). Integrate this branch only
after its two parent PRs; the sole designated integrator owns publication.
