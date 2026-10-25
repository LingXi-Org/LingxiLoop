# Retab UI original-file viewer

MIT © 2026 Retab; portions © 2023 shadcn. See [LICENSE](LICENSE).
Upstream: https://github.com/retab-dev/retab-ui, immutable commit
`321b3eacce133228042265c499d399c960bc7f13`.

`src/components/retab/` contains real Registry source, installed with the official
shadcn CLI 4.19.0. It is a third-party Registry, not an official shadcn file viewer.
`provenance.json` maps installed files to upstream paths and original SHA-256.
Only the file-viewer dependency closure is included; email/thumbnail applications,
Next.js and the upstream demo app are excluded.

The pinned Registry has cyclic Registry dependencies. `prepare-registry.py` flattens
that closure into `/tmp/retab-material-file-viewer.json`, preserves existing shared
package versions and routes imports into the isolated `retab` namespace. This
avoids replacing LingxiLoop's Dialog, Tabs, Button, Skeleton or other primitives.

```sh
git clone https://github.com/retab-dev/retab-ui.git /tmp/retab-ui
# In that checkout, select the exact commit above.
python third_party/retab-ui/prepare-registry.py /tmp/retab-ui
npm_config_cache=/tmp/retab-npm-cache npx shadcn@4.19.0 add /tmp/retab-material-file-viewer.json --yes
```

Host adaptations after installation are recorded in `adaptations.diff`:
relative shared Skeleton/Separator imports, Radix asChild download trigger,
strict unused-symbol compatibility, current Pretext argument order, omission of
email prewarm, and CSV block declarations. The original rendering engines,
zoom/page/sheet controls, DOM sanitizers and format-lazy imports are retained.
Vite workers use ES-module output and PDF.js resolves its existing local worker;
there is no external document conversion service.

The lazy `OriginalFileViewer` host integration acquires actual authorized bytes,
refreshes an expired URL once through the same source API, and passes a unique
per-open Blob identity. It aborts on close/account change and clears retained
PDF/DOCX resources on unmount. No Blob is placed in the shared query cache.
