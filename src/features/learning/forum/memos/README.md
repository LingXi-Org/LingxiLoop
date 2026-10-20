# Memos source reuse

Issue #219 replaces every live narrative editing entry with the full official BlockNote editor. The editor/toolbar rows and historic editor checks below document the earlier Memos integration; those editor components are no longer imported by product entry points. Retained Markdown, tag grammar, search, task and presentation helpers still serve existing content and shared chat. Current source/version/license, native controls and business boundaries are recorded in [the BlockNote integration](../../../../../docs/evidence/issue-219/BLOCKNOTE.md).

The source is pinned to [usememos/memos commit 8120a6cee03003ee7968b49b2109f816fa4d96a4](https://github.com/usememos/memos/tree/8120a6cee03003ee7968b49b2109f816fa4d96a4), retrieved from GitHub on 2026-10-13. The upstream MIT license is retained in `LICENSE`; adapted files carry source notices. This is frontend source reuse; no Memos Go service or parallel resource store is introduced.

Posts, details, comments and submission history share Memos content components. Generic buttons, inputs, menus, dialogs, popovers, tooltips, checkboxes and confirmations use the existing LingxiLoop shadcn components and theme variables.

| Local file or directory | Fixed upstream source and host adaptation |
| --- | --- |
| `editor/Editor/` | `web/src/components/MemoEditor/Editor/`: CodeMirror editor, Markdown decorations, keyboard handling, IME-safe synchronization, selection/undo, upload anchors, tag completion and editor CSS. Product props supply labels, bounded length, disabled state and course tags instead of Memos auth/query hooks. |
| `editor/formatting/`, `editor/hooks/`, `editor/types/`, `editor/Toolbar/` | Memos MemoEditor formatting command catalog, controller contract, active-state/width hooks and responsive formatting toolbar. Chinese labels and existing shadcn controls replace Memos translations and Base UI. Toolbar actions do not submit the form; closing a menu restores editor selection/focus. |
| `editor/utils/` | Memos Markdown/tag/mention grammar, Unicode tag ranges, GFM link/email scanning and Markdown source-boundary helpers used by the editor. The generated Unicode ranges are retained from the fixed upstream source. |
| `MemoEditor.tsx`, `../useForumDraft.ts` | Host adapters for Memos edit/preview and autosave lifecycle. The editor stays mounted across preview to preserve selection/undo. Only modified, nonempty drafts are saved; readonly views never write. Saves debounce and flush on page hide/unmount, are scoped to company/user/course/item, expire after seven days and retain at most 20 entries per company/user. Publishing or clearing the content removes that draft. |
| `markdownStyles.ts`, `markdown/`, `Table.tsx` | Memos Markdown typography, headings, lists, CJK quotes, inline code, links, images and horizontally scrollable tables. Image preview uses a shadcn dialog. Anchor links resolve inside the enclosing post; heading IDs retain Unicode and avoid local collisions. |
| `MemoContent.tsx`, `pipeline.ts`, `remark-*.ts`, `markdown-types.ts` | Memos renderer/component dispatch and plugins: disabled setext headings, GFM, mixed task-list splitting, tags and line breaks. Task boxes are read-only for readers; authors use parsed source edits through the authorized post API. Raw HTML remains disabled at the product boundary. |
| `MathMarkdownRenderer.tsx`, `math.ts`, `remark-currency-safe-math.ts` | Memos lazy math loading, syntax detection and currency-safe remark math parsing. KaTeX runs with trust disabled. |
| `CodeBlock.tsx`, `MermaidBlock.tsx` | Memos language/copy header, asynchronous syntax highlighting and diagram rendering. Uses the existing Shiki dependency, lazily loaded Mermaid with strict security, escaped fallback text and the product theme store. Copy errors and invalid diagram syntax are visible. |
| `MemoCard.tsx`, `MemoPinnedMark.tsx` | Memos MemoView/constants, header, body and pin marker. Product authors, permissions, teacher actions and theme tokens replace protobuf/context/router state. |
| `RelativeTime.tsx` | Memos RelativeTime using `@github/relative-time-element`; exact timestamps are available through the shared tooltip. |
| `search-match.ts`, `useSearchMatchHighlight.ts`, `memos.css` | Memos Unicode-aware matching and CSS Custom Highlight registration/cleanup, skipping formula/SVG subtrees. Forum search terms drive the highlighting. |
| `visualGalleryLayout.ts`, `../ForumAttachments.tsx` | Memos attachment gallery layout and attachment metadata presentation. Authenticated course file URLs replace Memos attachment URLs; image/video preview, audio controls and file downloads retain product access checks. |
| `../ForumContentFields.tsx` | Product upload adapter around the Memos editor/controller: picker, paste/drop, image insertion anchors, ordered attachment list, removal and retry after partial failures. Existing upload API/storage is reused. |
| `../ForumDiscussion.tsx` | Memos MemoCommentSection stack, heading, editor and load-more row. Course comments use the same content/editor/attachment components; company/course visibility is enforced by the server. |

The integration adds the CodeMirror packages used by the original editor, Markdown parser helpers, KaTeX, Mermaid and GitHub relative-time element with exact versions in the lockfile. It reuses existing ReactMarkdown, GFM, breaks, Shiki, Radix and shadcn dependencies. No outbound link-preview metadata fetch is added. Course membership, teacher moderation, private submissions and authenticated attachment URLs keep their API boundaries. Comment attachments are stored on the existing forum comment record; migration `0037_forum_comment_attachments.sql` adds bounded JSON fields and an attachment lookup index.

Migration `0038_learning_submission_sequence.sql` gives accepted attempts a database identity sequence. History uses this sequence for version order, preserving timestamps for display. It backfills existing records in their previous timestamp/ID order and remains compatible with old writers through the database default. This prevents clock rollback or equal timestamps from changing which new submission is the latest.

Repeatable acceptance: `node e2e/server/forum.mjs` runs the owning database/HTTP integration coverage; `node e2e/server/forum.mjs --browser-only` runs the official `@e2e-dev/web` browser suite. It covers role/file privacy, versions, course switches, closure, CodeMirror shortcuts, draft restoration, formatting preview, formulas, diagrams, attachments, comments, search highlighting, desktop/mobile, dark mode and keyboard focus. Verified reports/screenshots live under `artifacts/forum/verified`; the manifest identifies the exact run and validation scope.

The forum page follows Memos’ sidebar and leading-composer/feed arrangement. `ForumSidebar.tsx` holds the existing course content filters and a Chinese shadcn Calendar in its standard single-date mode. `src/components/ui/calendar.tsx` comes from the MIT-licensed [shadcn Calendar](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/calendar.tsx); only imports are mapped to the existing Button and theme utilities. React DayPicker is pinned to 9.14.0. The date selection filters the complete server query before pagination; no scheduling backend is added.

The mobile shell follows [Memos MobileAppHeader/MobileAppSidebar](https://github.com/usememos/memos/blob/25419a5239b0522a13dd451b4eaf5ae2b9a55908/web/src/components/AppSidebar/AppSidebar.tsx): a compact header opens a left Sheet, navigation and calendar move into it, choosing a section closes it, and the feed uses the full width with 16px padding. The drawer retains an exit to the course workspace. The permanent workspace rail remains available outside the mobile forum. There is no welcome panel. Layout verification and screenshots are under `artifacts/forum/verified/memos-layout`.

## Convergence acceptance for #132 (2026-10-14)

The pinned source above remains authoritative. The page now uses the leading
Home editor and in-place editing; the former create dialog is removed. The
following table covers the upstream forum surface and its product boundary.
Paths below are relative to upstream `web/src/components/` unless stated otherwise.

| Capability / upstream source | LingxiLoop integration and acceptance |
| --- | --- |
| Leading editor / `../pages/Home.tsx`, `MemoEditor/index.tsx`, `MemoEditor/EditorToolbar.tsx` | `CourseForum`, `ForumComposer`, existing directly ported CodeMirror/formatting sources. Inline free discussion and teacher-only assignment metadata; browser publishes both roles. |
| Formatting, Markdown preview, shortcuts / `MemoEditor/Editor`, `MemoEditor/Toolbar` | `MemoEditor`, `ForumContentFields`; GFM lists/tables/code, quotes, tags, links, math, diagrams and attachment preview. Preview keeps the editor mounted. |
| Autosave / `MemoEditor/hooks/useAutoSave.ts`, `MemoEditor/services/cacheService.ts` | `useForumDraft`; company/user/course/type/edit-ID isolation, 300 ms debounce, page-hide/unmount flush, seven-day/20-entry bound. No navigation confirmation. Browser verifies reload, failure, successful clearing and course/user/type switches. |
| Focus mode / `MemoEditor/hooks/useFocusMode.ts`, `MemoEditor/FocusModeOverlay.tsx` | Directly reused hook plus `ForumComposer` overlay, Escape exit and scroll locking; browser keyboard acceptance. |
| Attachments / `MemoEditor/Editor`, `MemoAttachmentListView`, `MemoAttachmentPreview` | Existing authenticated upload/paste/drop anchors, ordered list/removal, gallery, image/video/audio/file presentation. Course access remains server-owned; browser verifies public and private files and failed publishing. |
| Edit, delete, archive, copy, open / `MemoActionMenu/index.tsx`, `MemoActionMenu/hooks.ts` | `CourseForum` menu, inline author editing, confirmed soft deletion, archive/restore, permalink/detail, clipboard links/content. Teacher moderation; submitted assignments retain history and must be closed/archived. |
| Check/uncheck tasks / `../utils/markdown-task-actions.ts`, `MemoContent/markdown/List.tsx` | Directly ported parsed source edits, bulk commands and author-only individual task toggles through the post API. Readers' task boxes stay disabled; browser toggles and saves author tasks. |
| Pins / `MemoPinnedMark`, `MemoActionMenu` | Ported pin mark with teacher-controlled persisted flags and server-first sorting; integration rejects student moderation. |
| Tags / `MemoEditor/Editor`, `MemoFilters` | Ported grammar/completion, body tags and explicit metadata, clickable tag filtering. No second tag store. |
| Search, dates, properties / `MemoFilters`, `MemoView/useSearchMatchHighlight.ts` | Course-scoped server search/tag/date/attachment/link/task/code/pin filters; native text highlighting. Calendar filters the whole paginated query. |
| Display preferences / `MemoDisplaySettingMenu.tsx` | `MemoDisplaySettings`: single/two/three/automatic columns, compact expansion, created/updated sorting, oldest/newest; multi-column locks compact mode as upstream does. Local display preferences contain no content. Browser checks layout switching. |
| Comments / `MemoCommentSection` | Same native editor/content/attachments; paging, author edit, teacher/author delete. Independent auto drafts and server membership checks. |
| Reactions / `ReactionSelector`, `ReactionView` | Persisted per-user emoji pills and selector; bounded six-emoji course vocabulary, explicit idempotent add/remove. Browser and concurrent-safe API coverage. |
| Header, feed, mobile sidebar / `MemoView`, `AppSidebar`, `MobileAppHeader` | Ported card metadata/time/pin components, learning-discussion icon, Chinese labels, mobile Sheet/calendar, theme tokens and reduced-motion classes. Desktop/mobile light/dark screenshots. |
| Visibility, spaces, mention identities / `MemoEditor/EditorToolbar`, `MemoEditor/Editor` | Course membership and teacher/student permissions replace Memos space/public/private selectors and identity resolution. No anonymous/global Explore or Memos identity endpoints; assignment submissions remain private and separate from public comments/search. |
| Location and editable creation time / `MemoEditor/EditorToolbar`, `MemoView/MemoHeader` | Not exposed: the assignment contract has no location field, and original authorship/publication/submission timestamps must remain immutable. Teacher deadline is the supported scheduling field. |
| Link metadata previews, recording/transcription / `MemoDisplaySettingMenu`, `MemoEditor/EditorToolbar` | Their Memos provider endpoints are not installed. Authenticated file upload and audio/video playback work; external metadata fetch, recording/transcription controls are not presented as available. |
| Account/admin, integrations, instance settings / Memos settings routes | Existing LingxiLoop authentication, tenant policy, notification and administration authority; no independent Memos backend or duplicate account system. |

Corrections to the earlier integration notes: task checkboxes are editable only
by their author; draft dismissal is automatic; the calendar is a real date
filter; migration `0040` moves attempts and evaluations into forum submission
and feedback tables and removes the old learning schema. The older `0037/0038`
notes and verified artifacts describe their historical releases only.

## Issue 146: source-based detail page

`MemoDetail.tsx` directly adapts the fixed upstream
[`web/src/pages/MemoDetail.tsx`](https://github.com/usememos/memos/blob/8120a6cee03003ee7968b49b2109f816fa4d96a4/web/src/pages/MemoDetail.tsx):
its full-page section, `max-w-2xl` content column, parent navigation, non-compact
MemoView, and following MemoCommentSection are retained. `navigation.ts` adapts
upstream `components/MemoView/navigation.ts` origin state. Host URL parameters
(`project`, `view`, `post`, `type`) replace the Memos router/protobuf identifiers.
No post or homework detail Dialog remains. Existing ported MemoCard, MemoContent,
MemoEditor, comment stack and theme tokens continue to render the content.

The course-only addition between the memo and comments is the submission list:
collapsed student rows, whole-roster server search, per-student history, frozen
selected conversation excerpts and genuine assessment states. These use existing
host controls; no replacement forum design or Memos backend is introduced.
`docs/issue-146-validation.md` records validation and source provenance.

The comment composer follows upstream `MemoCommentSection`'s `showEditor` state:
only “写评论” is shown initially, the editor opens in the comment stack, and
successful creation or cancellation closes it. Student rows reuse `MemoCard`'s
MemoView classes, avatar, author and relative time. The course-specific disclosure
button expands content within that same card. Statuses and reference links use
plain metadata text; there are no nested submission cards or extra status panels.
