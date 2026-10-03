# UI experience acceptance

Scope: browser Web and Admin, existing light/dark themes; no production writes.

## Failure scenarios (defined before implementation)

- Cold module/data loads show text-only fallbacks or a skeleton with the wrong page geometry.
- Loading, empty and error states appear together; failed refresh discards useful content.
- Search, tenant or resource changes briefly reveal a previous identity's data; stale responses overwrite the current view.
- Animation restarts on input/stream updates, remounts an editor, loses draft/focus/scroll, or accumulates during rapid navigation.
- Virtualized history replays entry effects while scrolling; loading older messages animates the transcript.
- Reduced motion misses portalled dialogs, JS animation, skeleton pulses or smooth scroll.
- Narrow viewports clip actions, long labels, dialogs or form fields; tables widen the entire page.
- Icon actions have no accessible name; keyboard/touch cannot reach hover-only actions; closing dialogs loses focus.
- Cached responses unnecessarily show loading placeholders; empty cached results flash a skeleton during refresh.

## Repeatable checks

Use the local `/scripts/ui-experience-browser-check.html` check page for DOM assertions and interactive scenarios. Fixtures remain local to this page and must reject unknown API calls. Run the check button and save its JSON result. Check mail, agents, learning, calendar, resources, settings, preview surfaces and the admin routes with slow/success/empty/error/refresh responses.

For each owning surface, cover initial load, successful content, empty result, first failure + retry, cached refresh + failure, and rapid identity changes. Check input value, focus and DOM node identity through updates. Verify reduced motion through the browser/system preference, including an already-running animation.

Visual matrix: widths 360, 390, 768, 1280 and 1440 px, light and dark. Record screenshots of shell, page-specific skeletons, loaded content, menus/dialogs and error states. Verify keyboard traversal, Escape/focus restoration, 200% zoom, long names and isolated horizontal table scrolling. Mobile soft-keyboard behavior requires a real device and must not be claimed from a resized desktop viewport.

## Coverage ledger (2026-10-03)

The browser assertions run actual owning components with local API fixtures. Unknown fetch/XHR requests are rejected. Reports record the measured viewport and theme, rather than a requested size.

| Surface | Evidence and scope |
| --- | --- |
| App shell / auth | Shell skeleton accessibility and overflow; cached desktop shell inspected; login card entry and existing form states reviewed. |
| Conversations / thread | Cached history has no item entry; live message enters once; streaming and history prepend retain nodes and composer draft. |
| Agents | Card skeleton accessibility and responsive layout; loaded card, error/retry and empty rendering reviewed. |
| Mail | Actual slow list, successful reader, refresh node retention and failed refresh alert verified. Search clear and isolated reader identity reviewed. |
| Learner / teacher | Actual slow/success/first-error/retry and layout checks for both perspectives. |
| Calendar | Month/week/day skeletons checked; mode switch entrance, retained refresh and event retry reviewed. |
| Source library / course drive | Actual slow/success/empty/error/retry; polling refresh preserves cards; course folders tested. Stale-response guards reviewed. |
| Course profile / content / members / status | All four actual page surfaces checked with slow/success/error/retry and narrow layout. |
| Settings / menus | Mobile drawer Tab loop and Escape focus restoration verified. Stable shell, lazy panels, notification refresh retention and existing menu focus behavior reviewed. |
| Document / presentation / canvas | Actual document and presentation slow/success/error/retry; TipTap draft, root and selected text retained. Canvas skeleton checked; identity isolation and cached refresh logic reviewed. |
| Admin overview / records / detail / search / analytics / status / authentication / company | Actual routes checked for title, document overflow, retained content during refresh, refresh error and recovery. Long titles and local table keyboard scrolling inspected. |
| Native message / server | Existing native message source is preserved; latest remote native-message release is the production base. Source matches the local checkout after newline normalization. |

The Web matrix covers 360, 390, 768, 1280 and 1440 px in light/dark themes, with 145 assertions per run. Admin reports cover the same widths/themes across representative route types. The report JSON files are authoritative for each executed check; code-reviewed entries above are not claimed as independently exercised business actions.

Reduced-motion preference changes were simulated for the native animation hook; the host's OS preference was not changed. Real mobile soft-keyboard behavior, 200% browser zoom, assistive-technology announcements and every business mutation were not independently verified. Fixture controls add a toolbar around Web; its height is not part of the production layout.

## Engineering checks

Capture pre-change baseline and post-change Web/Admin lint, typecheck, tests and builds separately. Do not attribute pre-existing failures to this change or silently hide them. Existing backend/native-message work is outside this task.


## Reproduction

```powershell
npx vite build --config scripts/vite.ui-experience.config.ts
python -m http.server 5191 --bind 127.0.0.1 --directory artifacts/ui-experience/site
```

Open `http://127.0.0.1:5191/scripts/ui-experience-browser-check.html`; choose a surface and use the loading controls, or click Run checks and save JSON. For Admin append `?admin=%2Fsystem` (or another existing route); append `&company=1` for company mode. Expand the local scenario control and run the Admin checks. Theme selection in Admin uses its real theme button.

Engineering commands completed for Web/Admin: lint, typecheck, existing tests (70 Web / 8 Admin), production build. The release checkout's Web/Admin lint and typecheck also passed. Build warnings concern existing highlight CSS, mixed imports and chunk sizes. Server checks and the production release outcome are recorded separately in deployment evidence.

Screenshots and JSON reports are under `screenshots/` and `reports/`. Compiled check-page output is ignored under `site/`; no dependency or package-manager changes were made.
