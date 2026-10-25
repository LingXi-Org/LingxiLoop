# #477 lazy semantic-evidence component handoff

Depends on #474's Retab viewer tree at pinned commit
`321b3eacce133228042265c499d399c960bc7f13`. The parent owns the final
`MaterialPreview` binding. This change does not edit the materials-page header,
the original-file preview, or the existing Tabs primitive.

## Bindings

```tsx
const MaterialSegments = lazy(() => import('./MaterialSegments'))
```

Inside `MaterialPreview`'s existing preview Tabs, add a `semantic` trigger
labelled “语义命中” only when `file.status === 'ready'`. Its `TabsContent`
should mount the lazy component only while that mode is active:

```tsx
<TabsContent value="semantic">
  {activeMode === 'semantic' && file.status === 'ready' && (
    <Suspense fallback={<ResourceSkeleton variant="detail" label="正在加载知识片段" />}>
      <MaterialSegments source={file} context={context} />
    </Suspense>
  )}
</TabsContent>
```

The parent may control this existing preview Tabs with local `activeMode`;
the main course materials navigation is unrelated. The component does not
load or query while absent. Its public props are only `source: KnowledgeSource`
and `context: MaterialContext`. It uses the existing materials QueryClient;
keys contain organization/user/course/space/source and current source update
state. Scope or source-version changes remount the component and discard old
query/selection state. Unmount cancels the consumed query signal; auth teardown
clears the QueryClient, and mismatched current identities render no evidence.

## Source and behavior

[Retab source-evidence row/interaction provenance](../../../third_party/retab-segments/README.md)
includes immutable original files and their MIT license. The bounded list
adapts upstream `SourceFieldList` and `InteractiveItemList`; original file
rendering and parsed-text rendering both remain Retab-owned. No dependency was
added for this frontend change.

`MaterialSegments` submits the actual query through `knowledgeApi.searchProjectSource`.
The previously returned `indexVersion` is sent for subsequent searches; a stale
response removes evidence and offers a fresh query without that old version.
No previous results remain visible during a new request. Stored/failed sources
cannot submit queries; pending sources show a waiting state if mounted directly.

Each anchor is verified again against its response's exact `extractedText`
snapshot before conversion from UTF-16 offsets to actual parsed-text line
ranges. Line endings match the pinned Retab viewer (CRLF, CR, LF, U+2028,
U+2029). The shared Retab `TextViewer` runs in plain-text mode and owns line
highlighting and scrolling. Sidebar pointer/focus previews and activation use
those ranges; hovering a viewer `data-source-line` maps back to its matching
evidence row. Missing/mismatched anchors show only the excerpt. The UI explicitly
says parsed-text lines are available while original-file pages/regions are not.
There are no invented page numbers, layout boxes, scores or hit rates.

Native buttons support Tab/Enter/Space plus Arrow/Home/End navigation, visible
focus, text selection state and a live query status. The list stacks above the
text on smaller screens; both reading areas have bounded scrolling.

## Verification scope

Three focused source tests cover actual line-ending/UTF-16 mapping, rejection
of a mismatched snapshot or invalid offsets, trailing-newline boundaries,
and rendered source/excerpt/selection/position labels with escaped markup.
All pass. Changed-file Biome and `git diff --check` pass.

The owning web/Node typecheck passed against the read-only shared #474 Retab
tree through a temporary untracked symlink; that symlink is removed before
commit. The first attempt exposed #474's missing relative Button imports,
and a second attempt exposed upstream `iconSm` sizes unsupported by the host
Button. The parent corrected those shared bindings, then the typecheck passed.
No independent review is requested or performed.

These are source checks, not browser acceptance or actual Notebook PDF/Markdown
ingestion/query evidence. The parent still owns the combined lazy binding,
actual semantic-query/browser acceptance and final CI. No production action.
