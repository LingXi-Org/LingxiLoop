# Original-file preview acceptance (#474)

This isolated development-only harness renders the actual Retab `FileViewerPreview` using real synthetic `Blob` bytes. It covers PDF, DOCX, PPTX, XLSX, Markdown, PNG, CSV, JSON, and TXT. Existing valid binary fixtures come from `e2e/fixtures/course-materials`; CSV/JSON/TXT bytes are generated locally. PPTX uses `synthetic-slide.pptx`, a copy of the existing valid package with a title and blue triangle added by `node e2e/material-preview474/make-slide.mjs`. The original fixture is untouched. The PPTX check requires over 1,000 blue pixels on the rendered slide canvas.

The ZIP and parsed-text check renders the actual `MaterialPreview` with explicit preloaded local query data. It verifies the unsupported-format wording, download action visibility, and that parsed text appears only after selecting its tab. It does not call the backend or download the ZIP.

This harness does **not** establish authentication, authorization, API access, real object storage, original-file loading through `OriginalFileViewer`, upload/download integrity, or a complete product journey. Those require the disposable API/browser environment described in `e2e/README.md`.

Run from the repository root:

```sh
E2E_TELEMETRY_DISABLED=1 npx e2e run --config e2e.material-preview474.config.ts --max-failures 1 --no-cache
```

For an already running isolated Chromium, add `E2E_CDP_URL=http://127.0.0.1:9228`. The official `@e2e-dev/web` engine performs all browser operations. Output goes to `.e2e/material-preview474`; the Vite log goes to `.e2e/material-preview474-vite.log`.

Authoring check:

```sh
npx tsc --noEmit --skipLibCheck --strict --module esnext --moduleResolution bundler --target es2022 --types node e2e.material-preview474.config.ts e2e/material-preview474/formats.e2e.ts e2e/material-preview474/vite.config.ts
```
