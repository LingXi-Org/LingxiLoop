# Memos source reuse

Upstream is pinned to [usememos/memos commit 8120a6cee03003ee7968b49b2109f816fa4d96a4](https://github.com/usememos/memos/tree/8120a6cee03003ee7968b49b2109f816fa4d96a4), retrieved through GitHub's contents API on 2026-10-13. The upstream MIT license is retained in `LICENSE`; copied/adapted files carry source notices.

Posts, details, comments and submission versions use these local Memos adaptations. The forum does not import LingxiLoop's shadcn components or Typeset renderer.

| Local file | Upstream source and adaptation |
| --- | --- |
| `markdownStyles.ts` | `web/src/lib/markdownStyles.ts`: copied heading scale, block rhythm, CJK quote treatment, list/code/link/image and tag classes. |
| `markdown/{Heading,List,Blockquote,InlineCode,Link}.tsx` | Same-named `web/src/components/MemoContent/markdown` files: copied components, including task-list child splitting. Imports and optional ReactMarkdown props are adapted; Memos link-preview nesting context is removed. |
| `Table.tsx` | `web/src/components/MemoContent/Table.tsx`: copied table/container/cell components and horizontal scrolling, without the link-preview context. |
| `MemoContent.tsx` | `web/src/components/MemoContent/index.tsx`, `MemoMarkdownRenderer.tsx` and `markdown/Paragraph.tsx`: retained the 16px/24px wrapper, first/last block spacing, paragraph and component dispatch. Uses already installed ReactMarkdown/GFM/breaks. No raw HTML, iframe or Memos managed-attachment parser is enabled. |
| `CodeBlock.tsx` | `web/src/components/MemoContent/CodeBlock.tsx`: retained language/copy header, code padding and horizontal scrolling. Native clipboard and escaped React text replace Memos highlighting, Mermaid, auth/theme stores and clipboard dependency. Copy failures are visible. |
| `MemoCard.tsx` | `web/src/components/MemoView/constants.ts`, `MemoView.tsx` and `components/MemoHeader.tsx`: retained content-card classes, 20px author slot, 13px author/time metadata, trailing actions and pinned corner. Product props replace protobuf/context/router hooks; metadata may wrap on narrow screens. |
| `MemoPinnedMark.tsx` | `web/src/components/MemoView/components/MemoPinnedMark.tsx`: retained triangular marker and hover size; native title/accessible label replace the tooltip dependency. Reduced-motion behavior is retained. |
| `MemoControls.tsx` | `web/src/components/ui/button.tsx`, `input.tsx`, `textarea.tsx` and tag styles: adapted Memos quiet/primary controls and input styles to native elements. Native select and labels connect the course form. Controls retain visible keyboard focus. |
| `MemoDialog.tsx` | `web/src/components/ui/dialog.tsx`: retained bounded centered popup, border, spacing, scroll region, title and close-button design. Existing unstyled Radix primitives replace Base UI for focus trapping, Escape, dismissal and return focus. |
| `../CourseForum.tsx` | `web/src/components/MemoView/components/MemoBody.tsx`: adapted the memo-body column/content/attachment structure to authenticated course attachments. |
| `../ForumDiscussion.tsx` | `web/src/components/MemoCommentSection.tsx`: retained full-width comment heading, stacked MemoView cards, editor and centered load-more row. Product comments and permissions replace Memos hooks, protobufs and lazy CodeMirror editor. |

MemoCommentListView, MemoPanelList, editor autosave, RelativeTime and search highlighting were inspected but are not copied. No Memos Go service, new dependency, parallel resource store, outbound metadata fetching or authorization path is introduced. Course membership, teacher flags, private submissions and authenticated attachment URLs keep their existing API boundaries.

Repeatable browser acceptance: `node e2e/server/forum.mjs --browser-only`. The official `@e2e-dev/web` runner covers student/teacher/peer access, versions, course switches and closure, plus rich Memos Markdown in feed/detail/comments, desktop/mobile, dark mode and keyboard focus. Verified reports and screenshots are under `artifacts/forum/verified`.
