# #575 — bottom gap and draft overflow

Baseline: latest main `528c034b`. Measurements below are from local Chromium
154.0.8037.57, Node v24.19.0, real ConversationThread/ConversationMessage/
HomeworkDraftCard/BlockNote components and synthetic public data. The fixture
uses the existing runtime and a gated in-memory homework API. It does not connect
to a production conversation. Its 48px header and 88px composer placeholder
leave a 764px reading area in a 900px-high window; the actual composer code,
upload transport and file-preview implementations are unchanged.

## Two separately measured causes

| Case | Before | After |
| --- | --- | --- |
| Bottom gap, both 1280×900 and 390×900 | Message column computed `padding-bottom:315px` from `35vh`; last message root ended about315px above the viewport bottom. | Keep `2rem` reading/focus space, still capped in short panes: computed32px, measured gap31.9–32.3px across tested states. Composer remains in its own row. |
| Loaded draft, desktop transcript | `clientWidth890`, `scrollWidth987`; loading state was890/890. | 890/890 after async load, edit/save error, stream completion and reload. |
| Loaded draft, narrow transcript | `clientWidth380`, `scrollWidth456`; card itself was308px wide and had no internal overflow. | 380/380; resize to320px yields310/310. Long title, body, criteria, attachment name and validation text remain readable. |

The horizontal offender was ForumContentFields' visually hidden upload picker.
Shared Input's `w-full` overrode the one-pixel width intended by `sr-only`. Its
absolute containing block was the transcript viewport: at390px window width,
the input started at x76 and was380px wide, ending at x456. The static card's
existing constraints did not contain this absolute box. In the same pre-fix DOM,
setting just that input's width/height to1px immediately changed transcript
scrollWidth456→380. The fix uses a native `input hidden`, preserving the same ref,
multiple selection, disabled conditions, selection reset and upload callback.
The existing visible attach button still opens the chooser. No global clipping
or scrollbar hiding was added; HomeworkDraftCard's root was not changed.

## Async growth and reading intent

The focused replay also exposed an async draft-height case where no user input
occurred, focus remained on body and selection was collapsed, yet following was
lost (378px from bottom). A layout/native-anchor scroll can arrive while height
has changed, before the resize observer aligns the pinned viewport; the old
scroll callback treated its distance as user unpinning.

`useClaudeScrollPinning` now records the height last aligned or manually pinned.
While still pinned and outside the existing150ms input cooldown, a changed height
is followed rather than treated as a reader leaving. Explicit input and reading
locks still release the pin; unchanged-height scrolling still unpins. The new
deterministic regression failed before this change and passes after it, including
manual return to a new bottom followed by scrolling away again. No second
scroll executor, runtime or message/protocol change was introduced.

## Executed checks

- 33/33 focused regressions: actual message SSR suite plus6 scroll/fade lifecycle
  tests (`ConversationMessage.test.tsx`, `chat-scroll.test.ts`).
- Web `npm run typecheck`, focused Biome lint and `git diff --check`: passed.
- `check.mjs`: passed14 DOM measurement states, at1280×900 and390×900, with
  resize checks at700×700 and320×700. All main page/transcript/card widths stay
  contained and bottom gaps stay within16–48px. States: ordinary reply, wide
  code/table with completed stream, draft loading, draft loaded, edited save
  failure, resized and reloaded.
- The same replay asserts ordinary stream following, visible earlier-prose
  anchor retention through append/completion, jump-to-latest, following after
  gated async draft load, and the existing attach button opening a multiple-file
  chooser. Wide code/table content has2 local horizontal scrollers in each
  tested primary viewport while the transcript itself has none.
- Independent read-only review is performed against the final production
  candidate; its outcome and final CI run are reported in the PR.

Raw measurements: [before](before.json), [after](after.json).

| Viewport | Before | After |
| --- | --- | --- |
| Desktop1280×900 | [Screenshot](before-desktop.png) | [Screenshot](after-desktop.png) |
| Narrow390×900 | [Screenshot](before-narrow.png) | [Screenshot](after-narrow.png) |

These are deterministic local component/layout checks, not a production-browser
acceptance claim. Physical touch, live model/provider streaming, real uploads,
IME and the reporter's original unnamed conversation were not exercised. The
focused reading check uses an existing earlier prose anchor; it does not assert
every possible card/selection/navigation anchor combination.

## Replay

Run the normal Vite dev server on5180. The fixture URL is
`/docs/evidence/issue-575/fixture.html`; it is not an entry in the production app.
With Playwright installed locally and Chromium available:

```sh
PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs \
PW_TEST_SCREENSHOT_NO_FONTS_READY=1 \
node docs/evidence/issue-575/check.mjs
```

`PLAYWRIGHT_MODULE`, `BROWSER_EXECUTABLE`, `LAYOUT_BASE_URL` and `LAYOUT_OUTPUT`
can select local equivalents. No new browser dependency was added to the
product or CI. The screenshot setting uses the installed font fallback rather
than waiting for optional font requests; dimensions and assertions use the live
DOM. API interception is anchored to the local `/api/` root so Vite's real
`/src/api/` JavaScript modules remain intact.
