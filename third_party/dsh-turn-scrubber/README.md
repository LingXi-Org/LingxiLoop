# dsh-turn-scrubber source attribution

The conversation question waveform uses the MIT-licensed Codex-style `TurnRail`
from [wsxwj123/dsh-plugins](https://github.com/wsxwj123/dsh-plugins/tree/c92ff6b61461de988cbf152bd2c6273ceb7406cc/packages/dsh-turn-scrubber).
This is a community Codex recreation, not OpenAI's desktop application source.

Pinned revision: `c92ff6b61461de988cbf152bd2c6273ceb7406cc`.

Imported source:

- `packages/dsh-turn-scrubber/src/client/TurnRail.tsx` → `src/components/vendor/dsh-turn-scrubber/TurnRail.tsx`
- `packages/dsh-turn-scrubber/src/client/rail.module.css` → `src/components/vendor/dsh-turn-scrubber/rail.module.css`
- `packages/dsh-turn-scrubber/LICENSE` → `LICENSE` here and `public/licenses/dsh-turn-scrubber.txt`

The original Gaussian `waveScale` / `waveGlow`, constants, compact centered
layout, fisheye offset calculation, pointer-to-displayed-line mapping and bar
styling are copied from that revision. They are not a newly drawn approximation.

Host integration changes:

- Replace DSH session snapshots, full-index RPC and scroll handlers with canonical
  LingxiLoop question IDs/previews and the existing guarded navigation callback.
  Earlier history remains owned by the existing IM transport.
- Measure a reserved left gutter beside the viewport; mirror the source's
  right-aligned rail. The composer and message text are never covered.
- Use the existing portal tooltip for viewport collision handling, keyboard
  previews and Escape. Keep native buttons; add arrow/Home/End navigation,
  `aria-current`, visible focus and current-reading contrast.
- Allow one-question conversations and narrow screens. Add reduced-motion
  overrides for the imported transitions. Map DSH colors to product theme tokens.
- Keep the upstream CSS intact followed by documented host overrides.

The MIT copyright and permission notice is retained in `LICENSE` and shipped at
`/licenses/dsh-turn-scrubber.txt`. The rest of the repository's license is unchanged.

## Recheck provenance

Download the two files from the pinned GitHub revision above and compare against
`upstream.sha256`. Review the adaptation with:

```sh
diff -u /tmp/TurnRail.tsx src/components/vendor/dsh-turn-scrubber/TurnRail.tsx
diff -u /tmp/rail.module.css src/components/vendor/dsh-turn-scrubber/rail.module.css
```

Search also found Notra UI Chat Minimap (AGPL repository, not selected) and
bilbillm/dsh-conversation-minimap (MIT; compact rail without this hover waveform).
