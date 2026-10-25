# Retab source-evidence list adaptation for #477

- Source: [retab-dev/retab-ui](https://github.com/retab-dev/retab-ui), MIT,
  copyright © 2026 Retab; portions copyright © 2023 shadcn.
- Fixed commit: `321b3eacce133228042265c499d399c960bc7f13`, the same revision
  as #474's shared original-file and text viewers.
- [Complete license](LICENSE).
- Upstream originals are retained under `upstream/` for comparison.

`src/features/course-materials/MaterialEvidenceList.tsx` adapts the row markup
and primary-green active styling of
[`SourceFieldList`/`SourceFieldRow`](https://github.com/retab-dev/retab-ui/blob/321b3eacce133228042265c499d399c960bc7f13/registry/new-york-v4/ui/source-field-list.tsx)
and the focus/hover, Arrow/Home/End, preview clearing and activation model of
[`InteractiveItemList`](https://github.com/retab-dev/retab-ui/blob/321b3eacce133228042265c499d399c960bc7f13/registry/new-york-v4/ui/interactive-item-list.tsx),
which are the sources-viewer evidence-selection primitives. It uses native
buttons in a list with visible focus and a selected text label. The server
caps results at eight; upstream virtualization, source-map/form dependencies
and confidence/page metadata are omitted. Chinese labels show actual source
title, excerpt and availability of a verified parsed-text position.

`MaterialSegments.tsx` composes this list with the existing #474 Retab
`TextViewer` in plain-text mode. Its public `highlight` and
`scrollToLineRange` APIs receive only verified lines of the server-returned
text snapshot. A pointer over the pinned viewer's `data-source-line` node
previews the corresponding evidence row. There is no new file renderer and
no inferred PDF page, bounding box, sheet or slide location.

Original SHA256:

```
source-field-list.tsx  4fdbbf192eaeeaf86ccade0b28271772f889b0db34a04a2721a77f7c3870ab56
interactive-item-list.tsx  89822f26ea4742c57f7c99787cd592baf2c9d3bcc891dac480f154c439bc3f60
```
