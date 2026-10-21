# Sliding-window geometry (#264)

Written before implementation. The private screenshot establishes a mismatch
between selected packets and their outline; it does not establish its exact
source formula. The original conversation/document reference is unavailable.

Failure cases for a reusable range outline:

- Nominal cell width or gap differs from flex-shrunk, content-sized, or fractional
  layout. Multiplying an index by those constants drifts as the base increases.
- Viewport rectangles are applied as local CSS coordinates; borders, scrolling,
  CSS zoom or an axis-aligned ancestor scale magnify the error.
- Colors, labels and geometry use different base/window state or end bounds.
- Size changes, font completion, hidden-to-visible layout, and child replacement
  invalidate previously measured edges; observing only the outer frame misses them.
- An empty/end range leaves a stale rectangle; repeated setup leaks observers or
  animation timers; two widgets accidentally share state.
- A generic host rewrite guesses which arbitrary elements represent packets and
  damages unrelated content. No heuristic selector or source rewrite is allowed.

The supported renderer will use one state for packet states, label and selected
DOM elements. Its reusable, explicit range binding owns only its supplied outline
and an invisible coordinate probe. The probe measures the outline's actual local
origin and scale, so borders/scroll/zoom do not need independent guessed offsets.
The binding measures the union of the selected element rectangles. It is for
axis-aligned layouts, not rotated/skewed/3D planes; callers must keep ranges
rectangular (the supported packet row does not wrap).

The official browser regression uses the real product host and generated
fragment. A synthetic flex-shrink reproduction demonstrates the nominal-width
failure without claiming to be the private original. Assertions independently
compare the outline's viewport edges with actual packet rectangles at 2/4/6,
send/ack steps, autoplay, terminal state, resize, internal scroll/scale, a real
locally loaded font, hidden-to-visible layout and independent instances.

Storage/authorization integration must retain the normal author/run binding,
activation, readback and verification path. No migration or real user-data edit.
Passing this regression does not prove historical arbitrary HTML was repaired.
