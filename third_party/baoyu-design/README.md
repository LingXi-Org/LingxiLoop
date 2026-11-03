# baoyu-design Design and Slides provenance

Pinned source: [`JimLiu/baoyu-design@016b39d7fdcc30bfacee31ea5541498ac53921c6`](https://github.com/JimLiu/baoyu-design/tree/016b39d7fdcc30bfacee31ea5541498ac53921c6) (v2.8.0, MIT, [LICENSE](LICENSE)).

- `upstream/claude-design/` and `upstream/claude-slides/` are the complete, byte-identical `skills/claude-design` and `skills/claude-slides` folders. No host adaptation belongs inside them; `.gitattributes` keeps their bytes on every platform.
- `manifest.json` lists all 59 files with upstream path, byte count, SHA-256, Git blob SHA-1 and mode; each blob was checked against the pinned Git tree when it was fetched. `server/src/modules/artifacts/artifacts.test.ts` re-verifies every SHA-256.
- `distribution/` contains every remaining published file, including the design-system skill, templates and references. `complete-manifest.json` inventories the entire 542-file repository; paths and bytes match the pinned Git tree.
- Design retains its original bundled editor. Slides is rebuilt from [recovered named source](slides-source/README.md), including model, compiler, editing and export implementations, with the user's subsequent video removal applied to executable code.

## Native Slides build

`npm run build:slides-editor` compiles `slides-source/main.js` and `slides-source/node/compiler.js` into the ignored `server/assets/slides-editor/` directory. It does not wrap or patch the original editor bundle. Export implementations and PPTX/WOFF2 dependencies load on demand. Run before starting the API directly; the standard server development and runtime image paths already invoke it.

Hashed application-only assets are served at `/artifact-editor/slides-assets/`. Document files, uploads, writes and events retain their existing grant checks. Like Design, each Slides grant opens on its own isolated origin, so these shared assets stay in the browser cache across decks; the main-site editor URL keeps its opaque CSP sandbox. The build retains inline license notices and the dependency license inventory.

Run `node --test scripts/slides-editor.test.mjs` for source-build, pinned archive and compiler parity checks. `scripts/slides-workspace-benchmark.mjs` uses raw Chromium CDP with a fixed 20-page image fixture; it reports its environment and distinguishes real editor timings from full product acceptance. See `docs/evidence/issue-601/README.md`. No Playwright acceptance is claimed.

## Native adaptations

Host routes live in `server/src/modules/artifacts/` and `src/features/artifacts/`; the Slides build lives in `scripts/build-slides-editor.mjs`. None modifies a pinned upstream input.

| Upstream | LingxiLoop |
|---|---|
| `server.mjs` `Store` on a `project/` folder | `store.ts`: `artifact_files` rows, one transaction per publish (same all-or-nothing `ifMatch` 409, limits and `_files.json` listing); uploads in object storage |
| Random loopback grant in `/<kind>/<grant>/` | `grants.ts`: signed grant bound to person, artifact and access mode; every request re-checks current access |
| Embedded Slides download fallback | `editor-downloads.ts`: the existing `slidesHost.downloads.save` capability saves generated blobs in the browser without entering the upstream fallback dialog |
| `sameOrigin` write check | Grant write mode; each Design and Slides grant gets its own isolated origin (Design for its same-origin child artboards, both for cached editor code); the main-site page always keeps the opaque CSP sandbox |
| `fs.watch` + poll → SSE `external-change` | Redis `lingxiloop:artifacts` events → the same SSE stream; an editor's own saves are not echoed |
| Content id = first 32 hex of SHA-256 | HMAC of artifact and SHA-256, so a root `/_blob/<id>` is an unguessable per-artifact capability |
| `comments.json` + lock file | `artifact_comments.doc`, locked by row; the comment model functions are ported unchanged |
| `--agent-hook` / `comments --wait` | A sent comment becomes a conversation message to the room's agent |
| `artifact.mjs check <root>` | `check.ts` runs the vendored `artifact.mjs check` unchanged on a temporary copy |
| `SKILL.md` and `artifact-type/reference/` | `skills.ts` registers the SKILL.md text with only local CLI, comments and sharing instructions adapted to native tools; references via `<kind>.read_reference` |
| Local `<root>` folder, `open`, `list`, `cp` | One Design per conversation, Slides per project; Slides design systems stored under project/ds/<namespace> through native tools |

## Chinese copy and built-in themes

Design's UI is translated at build time with `scripts/design-copy.mjs` and
`host/design-zh-CN.json`, sharing the Slides catalog where wording agrees.
Recovered Slides modules retain translated native UI and template placeholders.
User content, persisted names, identifiers, protocol values, font/brand names and
format abbreviations are preserved. ICU tests retain arguments and plural/select
branches. The original vendored files remain byte-identical.

`host/builtin-themes.json` adds original 学术蓝, 森林课堂 and 深色演示 palettes
using upstream's documented color/type token schema and local font fallbacks.
Only new artifacts receive these `designSystems` records and token files through
`initialIndex`/`initialResources`; existing artifacts are never backfilled.
Slides retains its original default style. Selecting a theme uses the existing
editor controls and saved look memory. Slides' existing four-system limit means
its default plus these three fills the quota; replacing a system uses the
existing document tooling. No remote import, filesystem sync or new API is added.
See [upgrade evidence](../../docs/evidence/issue-648/README.md).
