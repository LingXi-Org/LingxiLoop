# Browser format acceptance — 2026-10-25

The final isolated acceptance run passed **10 / 10 tests**, with **0 failed, skipped, interrupted, or flaky** results. Duration: 24.57 seconds including 517 ms app startup. Runner: tester-army/e2e 0.17.0 and its official @e2e-dev/web 0.12.0 engine, using an isolated Chromium CDP session at 1280 × 900. No Playwright API was imported or run directly.

```sh
E2E_TELEMETRY_DISABLED=1 E2E_CDP_URL=http://127.0.0.1:9228 npx e2e run --config e2e.material-preview474.config.ts --max-failures 1 --no-cache
```

PDF, DOCX, PPTX, XLSX, Markdown, PNG, CSV, JSON, and TXT rendered through the actual Retab `FileViewerPreview` with real synthetic Blob bytes. PDF and PNG wait for rendered canvas markers; PPTX waits for the slide canvas, finished skeleton, and absence of render failure. XLSX and CSV additionally require the actual Triangle cell to be visible. The supplied PPTX is a valid single blank slide; this checks slide rendering, not complex presentation fidelity.

The actual `MaterialPreview`, supplied with explicitly preloaded local query data, showed the truthful ZIP unsupported-format fallback and its download action. Parsed text remained absent until selecting the separate parsed-text tab.

All screenshots and their SHA-256 values are retained in [browser/results.json](browser/results.json), alongside the [native summary](browser/summary.md). Representative screenshots: [PDF](browser/pdf-original-rendered.png), [DOCX](browser/docx-original-rendered.png), [XLSX](browser/xlsx-original-rendered.png), [ZIP fallback](browser/zip-truthful-fallback.png), and [parsed text](browser/parsed-text-separate.png).

The first run revealed a harness-only height issue because an arbitrary Tailwind class outside the source scan was not generated. The harness now uses an inline fixed-height wrapper and explicit visible grid-cell assertions. The final run and retained screenshots use that corrected harness.

The standalone E2E/config/Vite TypeScript check passed. This scoped harness does **not** prove backend authorization, real API/storage access, the `OriginalFileViewer` original-file loader, or upload/download integrity. Those remain outside this acceptance result.

Environment startup initially blocked the default engine browser installation (`BROWSER_INSTALL_FAILED`, ENOENT creating `/home/agent/.cache/ms-playwright`). Chromium launched inside the nested filesystem tool sandbox also aborted on its SUID helper configuration. The parent thread then started ordinary Chromium through the approved execution path outside that nested remap, preserving Chromium sandboxing and system permissions; the official engine connected successfully. No current browser blocker remains.

## Structured PPTX follow-up

After the host Button import switch, a narrow PPTX run passed **1 / 1 selected test**, with zero failures or skips, in 6.87 seconds including startup. The preceding 10 / 10 run remains the full format result; it used the original blank PPTX fixture.

The improved `e2e/material-preview474/synthetic-slide.pptx` preserves the original fixture and adds a text box reading “Triangle has three sides” plus a blue triangle. The reproducible JSZip generator changes only `ppt/slides/slide1.xml`. The test requires more than 1,000 blue pixels on the rendered slide canvas, a finished slide skeleton, and no render-failure message. Visual inspection confirms both the title and triangle in the [structured PPTX screenshot](browser/pptx-structured-original-rendered.png). [Follow-up result and hashes](browser/pptx-structured-results.json).

```sh
E2E_TELEMETRY_DISABLED=1 E2E_CDP_URL=http://127.0.0.1:9228 npx e2e run --config e2e.material-preview474.config.ts --grep 'synthetic pptx' --output .e2e/material-preview474-pptx --max-failures 1 --no-cache
```

An earlier follow-up attempt failed before fixture mount because Vite could not resolve three relative Button imports during the import update. Those imports were corrected before the passing run above. No renderer changes were made for this follow-up.
