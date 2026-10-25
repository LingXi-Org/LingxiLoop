# Studio Admin course materials adaptation

Repository: https://github.com/arhamkhnz/next-shadcn-admin-dashboard

Fixed upstream commit: `51fb5d90e09b80f6c96b313a24b34c1514e3352b`.
License: MIT, Copyright (c) 2024 Mohammed Arham Khan. Complete original notice:
[upstream/LICENSE](upstream/LICENSE).

On 2026-10-25 the files below were downloaded from GitHub's raw fixed-commit
URLs into `upstream/`, copied into the local feature, then edited. The snapshots
remain byte-for-byte unmodified. `upstream-sha256.txt` records their checksums.
No upstream package manifest, Next.js shell, router, storage, or auth was copied.
The original `data.ts` snapshot includes its upstream examples solely for
source provenance; those arrays are removed from the shipped feature.

| Original path below `src/app/(main)/dashboard/file-manager/` | Local path | Adaptation |
| --- | --- | --- |
| `_components/file-list-view.tsx` | `src/features/course-materials/file-list-view.tsx` | Retains Table/row/name-button/owner-avatar/menu composition; reads current source props directly; replaces star/share controls with selection; adds format, numeric/date sorting and true source status. Owner column appears only in public space. |
| `_components/file-manager-toolbar.tsx` | `src/features/course-materials/file-manager-toolbar.tsx` | Retains InputGroup search and Radix filter/sort menu groups; replaces fixed radio values with controlled query/filter/sort props; adds accessible format selector and capability-gated upload action. |
| `_components/file-actions.tsx` | `src/features/course-materials/file-actions.tsx` | Retains menu trigger/content/group/item structure; replaces template star/share/trash no-ops with real preview/download/rename/delete/retry handlers gated by server capabilities. |
| `_components/data.ts` | `src/features/course-materials/data.ts` | Retains FileKind/icon/label mapping pattern; removes sample files/folders and display-string metadata; expands formats and consumes existing KnowledgeSource raw byte/timestamp fields. |
| `page.tsx` | `src/features/course-materials/CourseMaterialsPage.tsx` | Composition reference only. LingxiLoop container uses its existing routing, active course/auth state, public/private tabs, server API, upload queue and query cache. |

`adaptations.diff` is a reproducible original-to-local diff of the four copied
components. It records substantive source reuse rather than visual inspiration.
Regenerate after modifications with:

```sh
python3 third_party/studio-admin/update-provenance.py
```

The feature uses existing LingxiLoop React, Lucide, UI primitives, theme tokens,
`cn` behavior from those primitives, TanStack Query and Zustand. There are no
Next imports, extra dependencies, demo runtime data, folder/share/favorite
controls, or second storage system.

## Retired-page consumer trace

Before deletion, `rg` showed `ProjectSourceLibrary` had no runtime importer;
its only external reference was the sensitive-action source regression, which
now checks `CourseMaterialsPage.tsx`. `SourceLibraryBrowser` and
`KnowledgeSourceUploadDialog` were imported only by `ProjectSourceLibrary`.
`SourceSkeletons` was used only by that browser and its own internal helper.
All four old-only files are removed. `knowledge/api.ts`, `contracts.ts`,
`state.ts`, `workspace.ts`, `ConversationSourceToggle` and
`components/WorkspaceChrome.tsx` remain shared and available to conversation
citations/details.
