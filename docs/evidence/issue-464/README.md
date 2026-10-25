# #464 compact user images

Baseline: `06e4a364f1355ae2c6bc027f84aa8674b88c6e4e`.
The layout change is `561968bdec077816955676461df7d3ac81af765b`;
the final product commit is recorded in [provenance.json](provenance.json).

User image parts, including image-MIME files and images inside attachments, now
form a wrapping group above the message body. A 128×128 button contains each
uncropped, proportional image. The sender's existing direction determines the
group alignment. Names remain in title/accessibility labels; loading/failure
states remain visible. Generic cards remain the default for documents, audio,
video and assistant images.

The existing ImageViewer opens the same source, with its zoom/pan/download/copy
controls. Acceptance exposed the shared Dialog's desktop width cap and missing
return focus; the viewer now explicitly fills the viewport and its owner restores
focus to the thumbnail after close. No upload, payload, original bytes, attachment
ID, message identity, converter, transport or server authorization code changed.
Storage IDs continue through the existing `/api/files?key=...` route; the existing
safe-source check also applies to thumbnails.

## Observed acceptance

Official `e2e` 0.17.0 + `@e2e-dev/web` 0.12.0, Chromium 154.0.8037.57 with its
sandbox enabled, Node 22.23.3. Both 1280×1000 and 390×1000 use the same public
synthetic scene, actual ConversationMessage/NativeMessageContent, native message
converter and assistant-ui external runtime. No backend requests were attempted;
the fixture rejects backend/cross-origin/socket access.

| Scene | Before | After |
| --- | --- | --- |
| Own image + text, desktop | 384×320.66 card below text, left of its bubble | 128×128 tile above text, aligned right |
| Own image + text, narrow | 308×270 card below text | 128×128 tile above text, aligned right |
| Other member's three images | Three stacked cards below text | Left-aligned tiles above text; third tile wraps on narrow screen |
| Pure 400×5000 image | 322px-high card with metadata/action row | 128px tile; actual image 10.08×125.97, original ratio retained |
| PDF / assistant image | Original card dimensions | Same dimensions, no thumbnail variant |
| Viewer before zoom | Shared Dialog capped at desktop width | Exact viewport bounds at both widths, no horizontal document overflow |

Both owning cases passed separately: layout/identity in the first candidate run
(4.31s), and preview interactions after the focus/viewport fix (5.16s). Cases use
one worker and zero retries. Layout verifies source equality, attachment IDs,
image order/count, loading success, proportions, long-name failure state, no row
overflow, sender alignment, quote, delivery/sending/failed state, and existing
retry/remove controls. Remount and page reload reconstruct the same message/image
identities. Preview verifies pointer and Enter activation, the same original
source, 100%→125% zoom, Escape close and return focus at both widths.

The first baseline attempt used an IIFE string where the official engine expects
function source; the test was corrected, and only the failed baseline layout
case reran. Baseline old-link presence passed. The initial candidate layout passed
while preview failed focus return. That failure and the viewport screenshot
guided the two actual preview fixes; only the affected preview case reran. No
assertion was weakened, and no unrelated browser/test matrix was added.

Focused card/source and attachment-message tests passed 6/6. The new compact
source regression failed against baseline (missing thumbnail, old full card).
Targeted Biome, application and fixture TypeScript, and whitespace checks passed.
Local `npm run build` passed in 56.21s before the preview follow-up; the final
fixture build including the preview fix passed in 45.68s. Exact final-head CI is
linked from the draft PR. Existing bundle-size warnings remain.

## Screenshots and reproduction

| Scene | Before | After |
| --- | --- | --- |
| Own single, desktop | [before](screenshots/before-mine-single-1280.png) | [after](screenshots/after-mine-single-1280.png) |
| Own single, narrow | [before](screenshots/before-mine-single-390.png) | [after](screenshots/after-mine-single-390.png) |
| Multiple, desktop | [before](screenshots/before-other-many-1280.png) | [after](screenshots/after-other-many-1280.png) |
| Multiple, narrow | [before](screenshots/before-other-many-390.png) | [after](screenshots/after-other-many-390.png) |
| Pure long image, desktop | [before](screenshots/before-mine-pure-1280.png) | [after](screenshots/after-mine-pure-1280.png) |
| Pure long image, narrow | [before](screenshots/before-mine-pure-390.png) | [after](screenshots/after-mine-pure-390.png) |

[Failed preview/long name](screenshots/after-mine-failed-390.png),
[desktop original at 125%](screenshots/after-viewer-pointer-1280.png),
[narrow original at 125%](screenshots/after-viewer-keyboard-390.png).
Raw measurements and official reports are in `measurements/` and `runs/`;
source/artifact SHA-256 digests are in `provenance.json`. Runner VCS metadata
does not include the then-untracked fixture; those explicit digests identify it.

```sh
node node_modules/vite/bin/vite.js build --config e2e/user-images/vite.config.ts
node node_modules/vite/bin/vite.js preview --config e2e/user-images/vite.config.ts --host 127.0.0.1 --port 5246 --strictPort
E2E_BASE_URL=http://127.0.0.1:5246 E2E_CDP_URL=http://127.0.0.1:9346 node node_modules/e2e/dist/cli/bin.js run --config e2e.user-images.config.ts
# Use USER_IMAGES_BASELINE=1 against the baseline checkout/app.
```

This establishes the source-confirmed display defect with local synthetic media.
It does not claim access to the reporter's screenshot/session, authenticated
production upload/download, real history pagination, or a live Agent's image
understanding. The unchanged data/permission owners remain responsible for
those operations. No independent review, production action, merge or issue
closure was performed; the designated release environment owns rollout.
