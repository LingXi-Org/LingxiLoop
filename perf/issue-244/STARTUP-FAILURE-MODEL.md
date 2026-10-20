# Normal startup follow-up, before product changes

The document timeline does not justify blank-frame prewarming: the initial
about:blank document takes <1ms in the local trace. Large variation occurs in
srcdoc navigation, complete inner-document parsing and runtime execution.
Do not add speculative lifecycle complexity for that observation.

A concrete production path does unnecessary work: `retainedPage.bind` sets
every anchor visible and calls ensure before IntersectionObserver reports the
real viewport. The manager allows 64 simultaneous pages; a history containing
many offscreen references can issue many POSTs and eight authorized resource
requests per page, then create many opaque frames. Each resource also performs
the real service's permission/version checks and file-integrity checks.

Hypothesis: defer only a cold owner's first core until its existing native
intersection observer reports visibility. Never suspend a ready retained core
merely to satisfy this optimization. Keep the original SDK/kit, acquisition
scope, late fresh-state read, monotonic revisions, and sandbox/CSP unchanged.

Failure cases to cover:

- A visible first card never starts; zero-height/hidden anchors reserve capacity.
- An initially offscreen card does work before first visibility.
- Scrolling or resizing a previously offscreen anchor does not wake it.
- Visibility changes while awaiting release/reservation start a stale cold core.
- Two anchors or repeated observer notifications create duplicate cores/pages.
- Return/reentry loses local state, duplicates resource requests or reuses a
  different conversation's state.
- A failed visible card cannot retry; disposal leaves observers/slots behind.
- API fixtures are misrepresented as real authorization/provider tests.

Use the existing complete fixture with six mounted references, one initially
visible and five separated by simulated historical text space. Same 250ms
per-resource delay, no-store, browser and viewport for baseline/candidate.
Measure first actual SDK-sized, painted content; retain the failing eager-load
counts and screenshot. Then scroll to the last card, interact, resize, and
return to the first retained card. No paid calls or production percentile claim.
