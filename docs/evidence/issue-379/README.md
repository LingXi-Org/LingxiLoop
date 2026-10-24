# #379 favicon and pinned-title correction

Base `9b2cc3fed2e75b36069b7001c1418084db956201`; isolated branch
`fix/379-favicon-pinned-title`. Issue body and all comments were read through the
GitHub connector on2026-10-24 (0 comments, no existing open PR claim).

## Consumer evidence and change

The canonical `assets/lingxiloop-logo.svg` and both public/marketing favicon SVGs
already use the same300-unit viewBox and rounded `rx=54` clip. They remain
unchanged. The shipped PNG32/192/512 and every ICO48/32/16 frame instead had
opaque white corners (alpha1), visibly producing a square on a dark tab surface.
The new actual image files have alpha0 at all four corners and opaque middle
edges/centers. The original mark, colors, geometry and non-favicon/native assets
are preserved. This change does not rely on CSS border-radius.

All main HTML/manifest icon URLs use `?v=rounded-20261024`. Marketing index and
privacy entries use that same revision and matching small assets. New URLs
invalidate the previously cached icon identity; keep these revisions in sync
when changing the icon files again. Existing unversioned fallback files are
updated too. No runtime network call, service worker or new dependency was added.

`ConversationListItemContent` adds `font-semibold` only for the existing true
`conversation.pinned` field. Normal titles keep the existing ItemTitle
`font-medium`; truncation and the labelled pin marker remain. The pin mutation,
API-to-store mapping, ordering, menu and account/course state are unchanged.
The single owning-line change is compatible with #373's separate status line.

## Generation and reproducibility

The normal repository path is now bounded:

```sh
node scripts-gen-icon.mjs --favicons-only
```

It renders only7 browser icon derivatives, leaving logo and native build assets
alone. It also places `-background none` before SVG decoding, since it is a
read/decode setting. The default all-icons path remains available for its
existing callers. ImageMagick and its SVG delegate are required for that path.

This selected environment has ImageMagick7.1.1-43 but its configured external
`rsvg-convert` delegate is absent; the attempted SVG render failed. This is not
reported as a successful run of the normal generator, and it does not prove
that argument order was the sole historical cause of the old opaque assets.
Root explicitly authorized the already locked/installed
`@napi-rs/canvas@1.0.8` fallback below. No package or external script was installed.
It uses the exact unchanged canonical SVG. PNGs and individual ICO frames are
rendered on initially transparent canvases; ImageMagick only packs the latter.

With Node22 on PATH, the actual generation was:

```sh
node --input-type=module <<'JS'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { writeFile, copyFile } from 'node:fs/promises'
const image = await loadImage('assets/lingxiloop-logo.svg')
for (const [path, size] of [['public/favicon-32.png',32], ['public/icon-192.png',192], ['public/icon.png',512],
  ['/tmp/issue379-favicon-16.png',16], ['/tmp/issue379-favicon-32.png',32], ['/tmp/issue379-favicon-48.png',48]]) {
  const canvas = createCanvas(size,size)
  canvas.getContext('2d').drawImage(image,0,0,size,size)
  await writeFile(path,canvas.toBuffer('image/png'))
}
for (const name of ['favicon-32.png','icon-192.png']) await copyFile(`public/${name}`,`website/assets/${name}`)
JS
magick /tmp/issue379-favicon-48.png /tmp/issue379-favicon-32.png /tmp/issue379-favicon-16.png public/favicon.ico
cp public/favicon.ico website/assets/favicon.ico
```

`assets.json` records renderer versions and exact canonical/input/output SHA256
and byte sizes. Direct rendering of the small ICO frames avoids the partial
corner coverage observed when auto-resizing an already rasterized512px image.

## Validation and limits

Before implementation, all3 focused checks failed: pinned title lacked
emphasis, actual PNG corner was opaque, and ICO48 corner was opaque. That output
is retained in `before-regression.txt`. After implementation4 checks pass:
rendered pinned/unpinned/selected/unread/long-title combinations and semantic
marker retention; actual RGBA PNG alpha and sizes; all ICO frame alpha/center and legacy transparency mask;
and real HTML/manifest/marketing resource/version consistency. Pixel checks use
Node built-ins to decompress the committed bytes and require no renderer or
new CI installation. ICO resampling may retain partial antialias edge coverage;
the shipped frames' observed corner alpha is0.

```sh
node --import tsx --experimental-test-module-mocks --test --test-force-exit \
  src/lib/favicon-assets.test.ts src/im/ConversationList.test.tsx
```

Focused lint passes9 source/fixture/config files; generator syntax and `git diff --check`
pass. `tsc -p e2e/favicon-pinned/tsconfig.json --noEmit` passes, covering all web
source and the new fixture/config. Its first attempt failed because the sparse
checkout omitted existing server modules imported by web tests; materializing
the tracked4.7MB `server/src` resolved those errors without code changes. The
serialized official browser scenario and independent final review passed as
recorded below. Exact PR CI is tracked on the final pushed head.
The browser fixture uses the real row renderer, API client and store reload/map
with a deterministic localhost API; its two pin controls are fixture affordances,
not evidence of changed production menu behavior. It also copies the actual
main index icon links and decodes the served icon bytes. A headless content
screenshot is not a screenshot of browser chrome. Edge/Safari tab rendering and
existing installed-PWA icon refresh cannot be established by a Chromium fixture.
No production deployment or issue closure is authorized by this workstream;
root remains the sole release owner. Rollback reverts this branch's icon files,
reference revision and pinned-title line together, with no schema/data change.

## Final browser and independent review

Independent read-only review of product commit
`123e93cb8a04125fe83419ea6974fed420603fd2` found noP1/P2; subsequent source
changes were fixture/check/evidence only. Official e2e0.17.0 +@e2e-dev/web0.12.0
run `01a16c9b-0574-7a07-85ae-887c64a0dc13` passed1/1 in13.46s (15.51s total)
on Node22.23.3 and the existing batch Chrome153 over CDP9337. The actual API
client and store reload/map yielded computed title weights
`500 → 600 → 600 after reload → 500 after unpin → 500 after reload`. Selection
and hover retained the pinned600 weight. The served32px PNG decoded with corner
alpha0; actual document favicon links all carried the new revision. At900px,
document scrollWidth was900px. The retained screenshot shows actual SVG/PNG/ICO
assets on light/dark backgrounds and both title states. It does not represent
browser-chrome capture, Edge/Safari execution or installed-PWA refresh.

The own Vite5196 process stopped with the successful runner; socket inspection
confirmed no listener. Its13MiB generated cache was removed and the browser slot
was handed to378. No browser installation, provider, API production access,
merge or deployment took place.
