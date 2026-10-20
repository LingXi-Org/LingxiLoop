# #246: content corners inside a rounded visualization

The public inline card has a 12 px rounded clipping boundary. The guest stylesheet
already reserves a 5 px paint gutter, but `PageAnchor` expands by 10 px and applies
a -5 px margin, cancelling that gutter. A rectangular authored surface can
therefore lose its corners even when the authored HTML fits its viewport.

Before changing the component, the deterministic `corners.html` fixture and
`corners.e2e.ts` check the following failure modes through the official
`@e2e-dev/web` engine at 1440 px and 390 px viewport widths:

- Any of the four content corners falls outside the rounded host boundary.
  Geometry is measured independently inside the guest and in the host; a host
  hit test also checks that a point just inside each content corner reaches the
  iframe rather than the clipped background.
- The content or host grows beyond the viewport, or height reporting crops the
  bottom corners.
- Moving the retained iframe into preview or back discards local state or leaves
  its inline geometry incorrect.
- Image capture geometry could stop matching the existing guest paint gutter.
  Source inspection verifies the unchanged `plane.captureBounds(5)` crop. Native
  clipboard access was previously denied and is not retried in this regression;
  no successful native clipboard or PNG verification is claimed.

The minimum geometric inset for a square corner inside a circular radius `r`
is `r * (1 - 1 / sqrt(2))`. For `r = 12`, this is about 3.52 px, below the
existing 5 px gutter. This protects content within its rectangular root bounds;
arbitrary shadows or authored overflow beyond those bounds are not guaranteed.
The fixture uses square color markers at the root edges, without its own radius,
shadow, SVG scaling, or extra padding.

The proposed owning change restores that gutter in the inline anchor only.
It reduces the guest's available content width by 10 px and retains the height
already reported by the SDK, including the gutter. Preview sizing, the 5 px
capture crop, authorization, CSP, sandboxing and upstream sources stay unchanged.

Separate content issues remain outside this fix: the original trend HTML in
`artifacts/issue-217-quality/original/trend.html` has a fixed-width SVG without a
`viewBox`; `artifacts/issue-217-quality/provider/trend-0.html` authors a 16 by 16
rectangle around the final point. Those dimensions come from generated HTML,
not the public card. This fix does not claim to repair them.

Execution results and screenshots must be recorded after running the unchanged
component (red) and then the fixed component (green). This document alone is not
passing evidence.
