# #445 / #446 chat layout implementation

Baseline: `9e3bfd892fa53f22dddbc00e98f466c21ce01b7d`.
Branch: `fix/445-446-chat-layout`. The previous #378 performance work is retained.

## #445: one title row and one summary row

`src/im/ConversationList.tsx` rendered task state between the title and preview,
so conversations with a run had three content rows. Task state now leads the
single summary line, followed by a separator and typing text when present,
otherwise the existing `PreviewText`. This preserves the preview after a
completed task instead of replacing it permanently with “已完成”. The whole
text segment truncates; pin and mute indicators remain separate fixed-size
items. Task-state accessibility labels, title, time, unread indicator and the
existing row selection behavior remain intact.

Both text rows use 20px line height. The shared natural row calculation is
40px text + 4px gap + 24px padding + 2px border = 70px, with 8px existing spacing
between rows. `ConversationsPane` therefore uses 78px as the initial Virtuoso
estimate on both viewport sizes. It retains automatic measurement; no fixed
row height or smaller font was introduced. Actual row and virtual-item geometry
were confirmed by the [focused browser comparison](README.md).

The new regression failed before the change with `3 !== 2` content rows.
After the change, `ConversationList.test.tsx` passed 3/3. It checks the title and
single summary across no state, processing, waiting, completed and failed runs,
with/without typing, plus long content, time, unread, pin, mute and the empty
preview fallback. Existing durable unopened-wait and selected/unread title
semantics remain covered. SSR structure is not a browser row-height measurement.

```sh
/workspace/.tools/node-v22.23.3-linux-x64/bin/node --experimental-test-module-mocks --import tsx --test src/im/ConversationList.test.tsx
node node_modules/@biomejs/biome/bin/biome lint src/im/ConversationList.tsx src/im/ConversationList.test.tsx src/features/conversations/components/ConversationsPane.tsx
git diff --check
```

All commands above passed on the candidate source.

## #446: remove persistent learning-help controls

This independent implementation was delegated to `gpt-6.1-sol` at high reasoning
effort. `ConversationComposer.tsx` was the sole product mount of
`LearningHelpActions.tsx`, so removing that mount covers ordinary, compact,
thread and narrow composers through the same owner. Its callback/imports and
the now-unused component, `learning-help.ts` helper and exclusive unit test were
deleted. The controls are removed from the DOM rather than visually hidden;
there is no replacement shortcut row or reserved space. Input, composition,
send/stop, quote, attachment and add-menu owners were not changed.

The only other consumer was the existing `e2e/visualize/learning` fixture. Its
helper imports and mount were removed. The scenario now edits the student's
attempt directly and checks it remains through an artifact action; its other
artifact, state, question and version checks remain in place. No Visualize
resource or runtime implementation changed, and this fixture was not rerun as
an additional browser matrix.

The active assistant-ui learning guide and source/reuse map now specify an
editable input without persistent learning shortcuts. They explicitly mark the
#373 shortcut design as historical and superseded by #446. Historical evidence
files remain untouched.

A consumer search over `src`, `e2e`, `.agents`, `scripts` and `.github` found no
remaining `LearningHelpActions`, `appendLearningHelp`, `LEARNING_HELP`,
`LearningHelpIntent` or `learning-help.test` references. The existing
`composer-composition.test.ts` passed 2/2; Biome passed for the three surviving
modified TypeScript files; whitespace checks passed. Browser send/stop,
multiline input, quote, attachment, menu/focus and compact/thread checks are
reported from actual observations in the [acceptance record](README.md).

## Verification boundary

The integrating thread owns the production build, one focused before/after
browser comparison at desktop and narrow widths, screenshots, row/item geometry,
selection and scrolling, exact-commit CI and draft PR. Those results are recorded
separately; the source checks above do not stand in for them. No independent
review, production action or unrelated issue was performed in this increment.
