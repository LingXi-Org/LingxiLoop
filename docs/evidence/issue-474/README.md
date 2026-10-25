# Issue 474: original-file preview

The course-material dialog defaults to original bytes, with parsed text in a
separate tab. Original bytes are acquired from the existing authorized source
and file routes; stored-only files do not require Notebook indexing. ZIP and
unsupported formats keep a download fallback. Account/course/space changes
remount the viewer; close aborts the request and releases viewer resources.

Actual third-party source: Retab UI `@retab/file-viewer`, MIT, pinned commit
`321b3eacce133228042265c499d399c960bc7f13`. The official shadcn CLI installed a
flattened pinned Registry closure. [Source mapping and adaptations](../../../third_party/retab-ui/README.md).
No handwritten PDF/Office renderer and no third-party online converter.

Local owning checks:

- `npm run typecheck`: passed, including the final host integration.
- `npm run build`: passed (ES-module workers required for parser lazy imports).
- Four focused `original-resource.test.ts` checks passed: stored-only actual bytes,
  URL refresh/credential isolation, denied access/account change, close abort.
- Repository web smoke command including those four: 131 passed.
- Changed-file Biome: no errors (upstream style warnings retained).

Per-format browser evidence is recorded separately. That isolated harness renders
actual Registry components and synthetic document bytes, and the real dialog's
ZIP/parsed-text surface; it does not establish live backend authorization or
Notebook indexing acceptance. Existing authorization routes are retained.
