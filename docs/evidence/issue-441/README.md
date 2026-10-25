# Issue #441: OfficeParser production payload

Baseline: `9e3bfd892fa53f22dddbc00e98f466c21ce01b7d`; implementation on
`codex/441-442-dependency-isolation`. Local measurements: Linux x64/glibc,
Node `24.19.0`, npm `11.9.0`, 2026-10-25. Production lock SHA-256:
`ea64311ced2f3afdb50d492ee7b90b492147ef3ede6e84a0529eb42d9538542c`.

## Consumer boundary and change

`server/src/modules/learning/homework-presentation.ts` uses OfficeParser's
published Node export with `fileType:'pptx'`, `ocr:false`,
`extractAttachments:false`, `includeRawContent:false`, and
`allowRemoteAssets:false`. The audited `PowerPointParser.js` calls OCR only
inside both attachment/OCR gates; `ocrUtils.js` lazily imports Tesseract when
creating an OCR worker. Installed packages outside OfficeParser/Tesseract have
no other import or dependency references to these packages, except npm's lock
inventory. The pruning helper verifies that consumer list before deletion.

Remove five OfficeParser browser bundles, six Tesseract browser JS/map files,
and twelve Tesseract core WASM/embedded-WASM files. Keep the published package
manifests, Node CJS/ESM entries, Tesseract Node JS and core JS glue, declarations,
README/SBOM, error/warning implementations, and all license files including
minified-browser license sidecars. No parser source is rewritten or forked.

Version/content hashes protect audited entry points, config merger, lazy OCR
loader, PowerPoint parser, PDF loader, and product source before any deletion.
The guard deliberately requires re-audit even for a product-source change that
does not change its current options. A retained-file inventory hash after
deletion proves that the selected payload is the only changed content.

OfficeParser independently resolves PDF.js `6.2.108` from its nested package:
`moduleLoader.js` prefers `legacy/build/pdf.mjs`, falls back to the root export,
and retains its worker. Keep its entire **34,497,725-byte** tree, including
browser assets, because the OfficeParser package also exposes PDF parsing and
its resource requirements have not been independently narrowed. Its retained
inventory SHA-256 is
`56593af9d66796130196785b96ae4fdfd0d0de2197c5f309a4d61338380e8d72`.
Existing top-level PDF.js `6.3.289` and GNU Canvas pruning remain separate and
passed when run in the original PDF.js → OfficeParser → Canvas order.

## Measured content bytes

The measurement uses `npm ci --omit=dev --ignore-scripts --no-audit --no-fund`
against the exact server lock (384 installed packages); it sums regular-file
content, without filesystem block, tar/gzip, OCI layer, or registry-transfer
overhead. `--ignore-scripts` is a local measurement limitation; image builds
retain their existing install-script behavior.

| Package tree | Before | Removed | Retained |
| --- | ---: | ---: | ---: |
| officeparser, including its nested dependencies | 66,663,211 | 27,914,949 | 38,748,262 |
| tesseract.js | 1,411,341 | 896,892 | 514,449 |
| tesseract.js-core | 45,262,431 | 44,709,707 | 552,724 |
| Total | 113,336,983 | **73,521,548** | **39,815,435** |

23 files are removed; all 822 retained files match their pre-prune inventory.
The removed and retained SHA-256 file inventories and per-file bytes are in
`prune-dry-run.json` and `prune-applied.json`. These are installed-content
savings, not image-transfer measurements; the release coordinator records
equivalent Docker/image measurements separately.

## Reproduce and verify

Use a disposable directory containing copies of `server/package.json`,
`server/package-lock.json`, and `server/.npmrc`, with an authorized package
registry token supplied only via the environment. Run its locked production
install, then execute from the repository:

```sh
npm ci --prefix "$PROD_DIR" --omit=dev --ignore-scripts --no-audit --no-fund --cache "$CACHE_DIR"
node server/scripts/test-officeparser-runtime-prune.mjs "$PROD_DIR/node_modules" server/src/modules/learning/homework-presentation.ts
node scripts/prune-pdfjs-server-runtime.mjs "$PROD_DIR/node_modules/pdfjs-dist" --apply
node server/scripts/prune-officeparser-runtime.mjs "$PROD_DIR/node_modules" server/src/modules/learning/homework-presentation.ts --apply
node scripts/prune-glibc-canvas-runtime.mjs "$PROD_DIR/node_modules" --apply
```

The smoke helper copies the locked install to a disposable temporary directory
and tests before/after behavior there. Set `TMPDIR` to a volume with room for
the copy if needed. It passed on the locked production install:

- Eleven PPTX tests before and after: reordered Chinese/English slides, table,
  notes, chart-containing deck, image-only deck, legacy PPT conversion error,
  actual password-encrypted Office container, corrupt/truncated inputs,
  compressed/uncompressed limits, pre-abort, in-flight abort, omitted-content
  warning, and unexpected operational dependency failures.
- Actual LingxiOS child-process PDF and DOCX extraction returns byte-identical
  text before/after; corrupt PDF/DOCX still fails without publishing output.
- Four mutations refuse deletion: OCR enabled at the product boundary, package
  version drift, lazy OCR loader content drift, and an added installed OCR
  consumer. The valid package then prunes successfully.
- Node OfficeParser ESM/CJS, Tesseract imports, and nested PDF.js imports pass.
  Match OfficeParser's legacy-first PDF import order; a standalone generic
  nested PDF import before DOM polyfill initialization fails with `DOMMatrix`
  undefined in plain Node. No retained PDF source is modified.

`prune-smoke.json` contains the guard results, actual PDF/DOCX output and both
PPTX test transcripts. `pptx-before.txt` and `pptx-after.txt` also record the
direct owning test invocation. `check-packaged-startup.mjs` now verifies the
retained exports/licenses and rejects additional product OCR/browser consumers
in the final image, in addition to its existing Web/Worker launcher checks.

## Limits and failed attempts

The new synthetic chart fixture exposes existing OfficeParser behavior with
`extractAttachments:false`: only its editable slide title is returned; chart
category/series/value text is absent. An initial assertion expecting those
labels failed **before pruning**. The final regression records the exact
preexisting title-only result. Changing chart extraction is outside this
dependency cleanup.

The first local install could not write the default npm cache; the next failed
GitHub tarball authentication. An explicit writable cache and the already
available authorized registry environment token resolved both. Neither failure
changed the lock. Full Docker final-package checks, Node 22/image measurements,
exact-candidate CI, production readiness, deployment and issue closure are
owned by the designated coordinator and are not claimed by this evidence.
