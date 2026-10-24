# Current-cloud #304 acceptance failure model

Recorded before adding the focused browser regression. Source baseline is
`58c1a214590e56d35caf328553df5ee1f2c6c0f1` (main including PR315).

- Reuse the existing isolated synthetic HTTP/SSE fixture and official
  `e2e` / `@e2e-dev/web` engine. Do not use private records, production endpoints,
  direct Playwright, patched dependencies, or fake media preferences.
- At 390px in light and dark themes, the real single process disclosure must
  open by keyboard, retain focus and `aria-expanded`, show its actual process
  controls in the viewport, preserve answer/results after closing, and avoid
  horizontal overflow. Capture geometry immediately before and after screenshots
  to reject a screenshot silently reframed by late following/scroll animations.
- Existing v2 first-character/handoff/correction, input/approval uniqueness,
  history races, manual scroll and visualization-owner regressions must still
  pass against this exact combined source. Report synthetic scope honestly.
- Cover persisted questionnaire replay/retry through the existing isolated
  questionnaire fixture. Failed/cancelled/partial/blocked outcomes must retain
  their honest status and visible results; a user without approval control must
  see the waiting notice without an actionable approval, even after disclosure
  and reload. No synthetic fixture proves production principal authorization.
- Reduced motion requires the browser's real
  `matchMedia('(prefers-reduced-motion: reduce)').matches` to be true before
  product assertions. A missing engine API or overridden browser preference is
  an acceptance capability gap; static classes and a normal-motion pass cannot
  satisfy it. Do not add a permanently failing target or count a prerequisite
  failure as a product regression.
- Bind the resulting native report, test inputs and dependency versions with
  hashes. Historical deployment records do not prove these fresh interactions.
