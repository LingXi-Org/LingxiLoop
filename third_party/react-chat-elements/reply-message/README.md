# React Chat Elements ReplyMessage

- Upstream: https://github.com/Detaysoft/react-chat-elements
- Source commit: `f487e7e83320bee8b74ac758d17f1ad418343173`
- Source paths: `src/ReplyMessage/ReplyMessage.tsx` and `ReplyMessage.css`
- License: MIT, copyright (c) 2017 Detaysoft; full license beside this file.
- These TSX/CSS files are the unmodified upstream snapshot. The application
  directly adapts the component at `src/components/vendor/react-chat-elements/ReplyMessage.tsx`
  and imports a byte-identical copy of the upstream CSS. No chat framework or new
  runtime dependency is installed in LingxiLoop.

Adaptations: reuse existing `clsx` instead of `classnames`; narrow the props to
text quotes (no media download); replace clickable div with a native button and
phrasing-content spans, or a noninteractive composer container; add accessible
labels. `lingxi-reply-message.css` adds scoped theme tokens, 10px corners, logical
start border, spacing, two-line clamping, focus and reduced-motion behavior.
The upstream owner/text flex hierarchy and stylesheet are reused, not redrawn
from a screenshot. See `docs/evidence/issue-302` for actual component comparison.
