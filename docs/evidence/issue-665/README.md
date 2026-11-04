# Case library acceptance — 2026-11-04

Issue #665 / PR #666. Screenshots contain disposable fixture data, not production records.

## Reproduce

From the repository root with the normal dependencies installed:

```sh
node scripts/fixtures/cases-preview.mjs
node --import tsx --test src/lib/webNavigation.test.ts src/features/cases/presentation.test.ts src/components/shell/modules.test.ts src/desktop/useSidebarWidth.test.tsx
```

Open `http://127.0.0.1:5205/cases`. This renders the production shell, case page, reader, cover and content editor. Only the transport is replaced with in-memory data. The fixture is not an application build entry.

## Browser results

Tested through the browser at 1440×900, 1024×768 and 390×844:

- Independent 64px rail entry, no course sidebar or resize divider. `?noCourse` still displays cases; clicking Courses opens the empty workspace selector.
- Default hero appears once, followed by six cards. With `?more`, Load more changes the grid from six to twelve cards and removes the button.
- Searching `KV` produces one result and hides the hero. Clearing restores it. Selecting 推理优化 produces the two matching records.
- Card/detail navigation, breadcrumb return, related-case navigation and browser back/forward work.
- Markdown headings produce four outline entries. Clicking the last section preserves its highlight at the scroll limit; focus moves to the heading. The phone outline expands and navigates correctly.
- `/cases/sample-0?view=cases&rich` produces separate `case-section-0` and `case-section-1` anchors for identical rich-text headings.
- `/cases/sample-0?view=cases&pendingCover` starts with a pending related cover; the existing poller updates it to the fixture's “相关案例封面已更新” image without navigation.
- `/cases/sample-0?view=cases&manager&rich`: enter management, edit title, save draft, publish, then unpublish. The UI reports each outcome. No production records were changed.
- `?switchCompany`: the fixture button changes the active organization store. Old records disappear, only 第二组织专属案例 remains, and its URL contains the new company ID. This tests the page's scope reset; it does not replace server authorization tests.
- `?theme=dark`: theme colors, labels and controls remain readable.
- At 1024px the grid's actual content width is 855px and it has two 413.5px columns. At 390px it has one 279px column and document width remains 390px. The mobile breadcrumb retains its full return label.

The 1440px layout uses 320px hero covers, 176px card covers, a 680px article column, a 300px detail cover, and a 220px outline separated by 64px. Typography, colors and spacing were compared visually against the supplied PDF and the extracted HTML rules. This is not an automated zero-pixel-difference claim: the supported content renderer, real metadata and deliberately omitted actions differ from the static mockup.

## Checks

- The management URL regression failed before the fix and passed afterward. Invalid view parameters are dropped and management state does not leak into other modules.
- Independent review of `cd5fd452`: no remaining actionable findings; 11 focused tests passed.
- File-scoped Biome lint: 13 files passed.
- `npm run build`: passed, including Web/Node typechecks and Vite build. Existing CSS highlight / dependency annotation / large-chunk warnings remain non-fatal.
- Subsequent content-container CSS adjustment was checked in the three browser sizes. Final PR CI is the final candidate build gate.

Production initially required sign-in in the browser. Authenticated production verification remains dependent on a user session; public readiness and release status are checked separately during deployment.

## Clamped outline follow-up

At 1440×900, both final headings reach the same maximum scroll position. The initial bottom-of-page rule wrongly highlighted the last heading when the previous heading was clicked. The reader now preserves the clicked heading until the scroll position actually changes, then resumes normal scroll tracking.

With the fixture detail page open at 1440×900, import `scripts/fixtures/cases-outline-check.mjs` in the browser tool session and call `checkCaseOutline(tab)`. Its assertions check the first heading, each of the last two headings at the same scroll offset, focus, and automatic tracking after PageUp. `outline-regression.json` records the failure and corrected results; `outline-clamped-1440.jpg` shows the corrected penultimate-section highlight.
