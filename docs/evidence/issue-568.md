# #568 — conversation fade, pinning and message metrics

Implementation baseline: LingxiLoop `51aec0ac` (latest main at start), retaining
the merged #564 runtime/locale and #565 math changes. No protocol, runtime,
authorization or persisted message data changes.

## Source and adaptations

Read directly from `Caho1/open-claude-ui` commit
`c1f923ae0051a871941b98a0e2e3183a545e6a85`:

| Upstream file | Git blob | Local adaptation |
| --- | --- | --- |
| `code-examples/ScrollFadeContainer.tsx` | `2e66071d7fac929f97e26ad8fee8a64e99a1c624` | `ScrollFadeContainer.tsx`: retain original vertical/horizontal mask alpha stops and 28px/2px boundary rules; forward DOM props/ref so `ThreadPrimitive.Viewport asChild` shares one scroll element. Initially clear fades until measured; observe content as well as viewport size, and direct-child replacement. Honor reduced motion for mask transition. |
| `code-examples/useClaudeScrollPinning.ts` | `9c132e0975af485900d0395b4caa72693872651f` | `useClaudeScrollPinning.ts`: retain 40px pinning, 150ms input cooldown, >120px jump threshold, immediate `auto` alignment. Ref-backed intent prevents a stale React render from stealing a scroll. Match programmatic scroll targets rather than swallowing the next unrelated scroll. Observe the stable message column/viewport for token, image, code, math and disclosure height changes; settle growth after cooldown. Explicit selection/navigation/disclosure pauses persist until user scroll/jump. Reset following on conversation/thread scope changes. |
| `code-examples/ChatMessageBubbles.tsx` | `4a73af4a9d0e013a69b3b287626d3862716020c7` | `ConversationMessage.tsx`: keep existing 18px outer radius and sender alignment; use 4px joined corners, 16px/12px padding, 85% human text measure, 14.5px human/15px Agent type. Preserve sender identity, grouping, delivery, attachments, reply branches, actions and native content renderers. |
| `code-examples/cds-theme.css` | `95e9be938979fdce6ab6553a3f4881507723b7b2` | `chat.css`: Agent 4px text inset, clamped text stop (zero inset on narrow containers), body/action spacing; user surface maps to existing primary/brand-bubble tokens and other humans to panel/ink. Existing paragraph rhythm, focus, touch actions and media components retained. No upstream business/demo state copied. |

MIT license verified at that commit; copyright and full grant retained in
`public/licenses/open-claude-ui.txt` and linked from `THIRD_PARTY_NOTICES.md`.

`ConversationThread.tsx` disables assistant-ui's bottom-following, initialization,
run-start and thread-switch scrolling, and removes its ScrollToBottom action.
The adapted hook is the only automatic bottom-following executor. The installed
assistant-ui 0.15.31 primitive remains the owner of history-prepend anchor
restoration (including subsequent image/font growth), rather than introducing a
second history anchor implementation. `loadOlder` pauses the hook before that
restoration. Question/reference navigation retains explicit user-directed scrolls.

The actual message column supplies `--chat-extra-space: 35vh` as bottom padding,
retained after completion to avoid shrinking the reading position. The hook's
upstream comment alone did not implement this layout. Composer, question index
and jump button stay outside the masked scroll element. The former composer blur
overlay is removed so the specified nonlinear mask owns transcript edge fading.

## Verification

2026-10-30, selected managed cloud environment, Node 22/npm:

- `node --import tsx --experimental-test-module-mocks --test --test-force-exit src/features/chat/components/ConversationMessage.test.tsx src/features/chat/components/chat-scroll.test.ts`: **32/32 passed** on code candidate `3feaf715` (27 real-message SSR regressions plus 5 deterministic scroll/fade tests).
- `npm run typecheck`: **passed** on `3feaf715`.
- Focused `npx biome lint` for ConversationThread, ConversationMessage, ScrollFadeContainer, useClaudeScrollPinning and chat-scroll tests: **passed**, no warnings; `git diff --check`: **passed**.
- `npm run build`: **passed** on the initial implementation (before the two small review fixes below); Vite completed in 50.94s, with chunk-size warnings. This ran the visualize source verification/runtime build, web typecheck and production Vite bundle. Post-review code was typechecked and regression-tested again; PR CI owns the final production rebuild.
- Independent read-only review against `3feaf715`: **no remaining concrete blocker**. Reviewer independently ran 5/5 scroll regressions and whitespace check. The review found and closed (a) a no-op bottom gesture disabling following without a scroll event and (b) the initial skeleton sentinel leaving a reading hold despite transport pagination being a no-op. Case (a) was reproduced red then fixed with a timer regression, including token growth during cooling and retained explicit reading lock. Case (b) was fixed by deferring sentinel observation while loading and checking loaded/pagination state before pausing; this guard was source-reviewed, not exercised in a real browser.

The event/lifecycle tests use mocked React hooks and deterministic viewport
measurements; the message tests use the actual assistant-ui server-rendered
components. These checks establish state/DOM behavior, not visual parity.

Real browser acceptance and before/after screenshots/recordings were **not run**,
per the user's browser-acceptance waiver. Desktop/narrow light/dark rendering,
physical keyboard/touch/selection, native history anchoring, focus at masked
edges, async media layout and long live streams remain unobserved in a real
browser. No screenshot, visual parity or production-deployment claim is made.
