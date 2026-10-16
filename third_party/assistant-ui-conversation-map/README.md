# Official assistant-ui Conversation Map

Source: https://github.com/assistant-ui/assistant-ui

Pinned revision: `2f3690c03954cac275f9bf9c26d81a18fc1e5ec0`.

Documentation: https://www.assistant-ui.com/elements/conversation-map

License: MIT, Copyright (c) 2026 AgentbaseAI Inc. The complete notice is retained
here and published at `/licenses/assistant-ui-conversation-map.txt`.

## Complete, unmodified source

The five files under `src/components/vendor/assistant-ui` are byte-for-byte copies
of `packages/ui/src/components/react/assistant-ui` at the pinned revision:

- `elements/conversation-map.tsx`: complete standalone public component.
- `elements/conversation-map.aui.tsx`: complete optional runtime-connected component.
- `elements/surfaces.tsx`: complete shared presentation module.
- `utils/range.ts`: complete shared numeric utility module.
- `utils/useIsomorphicLayoutEffect.ts`: complete shared effect utility module.

No functions, styles, behaviors, imports, or exports were removed or edited.
The existing `@/lib/utils` alias and installed `@base-ui/react` satisfy the source's
public dependencies. The runtime-connected alternative is retained intact; the
product uses the documented standalone `ConversationMap` interface because the
existing conversation owns pagination, IM identifiers and scroll-following intent.

Verify the committed source with:

```sh
sha256sum -c third_party/assistant-ui-conversation-map/upstream.sha256
```

Each manifest path maps to the identical suffix under the upstream directory;
compare it with the raw GitHub URL at the pinned commit when refreshing the source.
Never fix a regression by patching these files. Update the complete upstream
files or use their supported public interface.

## Product integration

`ConversationQuestionIndex.tsx` supplies entries, active/visible IDs, Chinese
accessible names and the existing navigation callback through public props.
The source owns ticks, preview portals, roving keyboard focus, keyboard navigation,
selection and the official tiered hover appearance. No Gaussian/fisheye code from
the previous implementation remains.

The host reserves a 44px gutter, provides a scroll container, and sets the public
`style.height` to 18px per entry with `min-h-full` and a 4px gap through `className`.
This keeps the source's 14px tick rows separated instead of shrinking a long
thread into the viewport. Focus outlines and reduced-motion integration also use
`className`; the vendored source remains untouched. The public class also maps
`--foreground` to the existing green `--primary` brand token, preserving the
official opacity tiers in both themes. Active reading follows into
the gutter unless the user is navigating it with the keyboard.

Below 768px the existing application `useIsMobile` hook unmounts the entire map
and its portals, leaving no reserved gutter or focus targets. The official
implementation is unchanged on both sides of this breakpoint.
