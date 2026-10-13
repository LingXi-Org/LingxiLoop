# Memos source reuse

Upstream: [usememos/memos](https://github.com/usememos/memos/tree/8120a6cee03003ee7968b49b2109f816fa4d96a4), commit `8120a6cee03003ee7968b49b2109f816fa4d96a4`, retrieved 2026-10-13 through GitHub's content API. The upstream MIT license is retained in `LICENSE`.

Files actually reused and adapted:

- `web/src/components/MemoView/components/MemoPinnedMark.tsx` → `MemoPinnedMark.tsx`: retained triangular marker, tooltip and reduced-motion behavior; replaced Memos translation/Base UI tooltip API with LingxiLoop's Chinese copy/Radix shadcn API and primary token.
- `web/src/components/MemoView/constants.ts` → `MemoCard.tsx`: retained content-card layout and existing compatible shadcn tokens; added reduced-motion handling.
- `web/src/components/MemoView/MemoView.tsx` and `web/src/components/MemoView/components/MemoHeader.tsx` → `MemoCard.tsx`: retained article/header/meta/action structure, author/time density and pinned placement; use product data as props and allow narrow layouts to wrap.
- `web/src/components/MemoCommentSection.tsx` → `../ForumDiscussion.tsx`: adapted the content/comment stack and paginated load-more row to product comments and the existing dialog/textarea; removed the Memos lazy editor, protobuf state and context dependencies.

Also inspected the upstream MemoPanelList, MemoEditor useAutoSave, RelativeTime and search highlighting sources. They are **not** copied: the editor controllers require Memos protobuf objects, Go API, authentication/context stores, CodeMirror and Memos routing; RelativeTime requires a new custom-element dependency. LingxiLoop keeps its existing authenticated HTTP, uploads, Markdown renderer, course authorization, activity workflow and shadcn forms. No Memos service, package dependency or parallel resource store is introduced.
