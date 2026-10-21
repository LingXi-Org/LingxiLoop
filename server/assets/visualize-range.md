# Explicit DOM range overlays

`visualize.read_reference({"path":"host/range-overlay.js"})` returns the complete
product helper. Include that returned source in a `<script>` in an authored
fragment, then call `window.lingxiVisualize.bindRangeOverlay(container, overlay,
selectedElements)`. Nothing is automatically injected into saved HTML.

- `container` is the positioned HTML containing the range.
- `overlay` is its direct child. The binding owns its position, dimensions,
  visibility, transform, zoom and pointer transparency. Author its border/color.
- `selectedElements` is a function returning the currently selected HTML elements
  from the same semantic state used for labels and colors. Return `[]` at the end.
- Call returned `update()` synchronously after each state/DOM change. Layout
  observation, resize/scroll and font readiness also trigger measurement.
- Call `destroy()` when removing a binding. It disconnects observers/listeners,
  removes its invisible coordinate probe and hides the old outline.

No widths, gaps, screen offsets or nominal index strides are supplied. The
outline follows the union of actual element rectangles using a probe in its
own containing block. This includes flex shrink, variable gaps, padding,
borders, scroll, CSS zoom and axis-aligned positive scale. Use a non-wrapping
row or otherwise rectangular range; a union across wrapped rows could include
unselected elements. Rotated/skewed/3D planes and independently transformed
outlines are outside this contract. Do not add CSS `!important` overrides of
the binding's geometry properties. External ancestor-only layout changes that
do not resize the observed subtree should explicitly call `update()`.

For packet send/ack explanations use `visualize.sliding_window`, which includes
this binding and one authoritative state for packets/labels/outline. It accepts
title, packetCount (2–60), windowSize (1–12, at most packetCount); changing size
resets its simplified batch send/ack simulation. It is not a full TCP simulator.

This helper cannot identify arbitrary historical semantics. Read an authorized
original before a targeted edit; never guess packet selectors, parse user-facing
text as state, globally rewrite saved HTML or claim the old component was fixed
just because a new supported renderer passes.
