# #377 saved-visualization loading

Stacked baseline: `0d1271a0cf92b22e01b456c7473f4e446027bd28` (the root's frozen
#373 integration). Root rebases only #377 commits after that stack is merged.
The complete issue and its zero comments were read before assignment to the
connected GitHub user. #259 remains `not_planned`.

## First bounded change

Measure and shorten opening already saved/delivered content. Keep complete
message/source/run/path admission, the final authorized fresh state GET,
highest-revision projection, cancellation/current attempts, opaque iframe/CSP,
gesture checks and #373 context/tweak receipts. Generation/save/delivery timing
is **not measured** in this workstream: root has no verified current complete
timeline, and no new model call or private production read is authorized.

The original host serially prepares fixed resources then requests fresh state.
The real-host Node diagnostic with synthetic120ms resource +120ms state returned
280.8/241.4/243.0ms. Those are three raw controlled preparation samples, not
browser paints or production percentiles. Direct early state prefetch could
widen the state-read-to-mount window on slow resources, so retain the final GET.

Candidate: cache only completed, hash-verified, allowlisted fixed public resource
bytes in bounded volatile browser memory. The authorized page response supplies
their fixed hashes. Scoped HTML, state, page capabilities and requests are never
cache keys/content; no in-flight capability-bearing request is shared. Each new
page still needs its own admission and final fresh state authorization. Missing
metadata uses the existing bounded resource path. A new hash misses the cache.

## Failure model and pre-implementation verification

- A cache hit must not bypass page admission, final fresh state or account/course
  checks; it must never restore another page's HTML/state/token.
- Cache only full successful fixed bytes; abort, truncated read, denial, integrity
  mismatch and transient failure remain uncached and retain bounded retry.
- Bound entries and memory. Metadata/name/path errors cannot admit private files
  or arbitrary scripts. Fixed renderer versions and current CSP stay unchanged.
- Preserve each participant's cancellation; do not deduplicate pending scoped GETs.
- Retained returns should reuse iframe DOM/state and issue no new resource reads;
  a fresh page must still get a new capability and personal-state query.
- The existing #373 original/current preview, current host display mode and stable
  accepted tweak receipt remain covered by their focused owning regressions.

`host-preparation.test.ts` exercises the actual host with controlled transport.
Its reuse regression is added before implementation; it should initially fail
because the second runtime is transferred again while HTML/state reads stay
separate. Pure resource-cache tests will cover integrity, failure, cancellation
and eviction before the cache is connected.

## Browser comparison and budgets

`e2e.visualize-377.config.ts` uses only the official engine and existing Chromium,
one Vite on5195, no install, trace or video. The fixed baseline server loads the
original host bytes through `git show` without rewriting that source; both runs
use the same authored static/interactive SVG, fixed resources and controlled API.
Every cold sample navigates anew to clear volatile bytes. Separate cases cover
normal cold startup,300ms per-resource+state latency, warm new pages, retained
returns and the first visible of three cards. An injected observer checks actual
SVG geometry and two animation frames; native clicks must produce a real SDK
state acknowledgement and rendered result. Handshake alone is not paint.

The browser baseline and frozen budgets landed in commit `65caec30` before the
host/server connection in `7e713ab4`. Results, the original full-suite failure
and the one permitted narrow diagnostic are recorded in `RESULTS.md`. Small
sample counts remain raw values, with no P50/P95 or production improvement claim.
