# baoyu-design Design and Slides provenance

Pinned source: [`JimLiu/baoyu-design@c15e76ef5134228d2bb5da35652d30d7d6b8a34d`](https://github.com/JimLiu/baoyu-design/tree/c15e76ef5134228d2bb5da35652d30d7d6b8a34d) (v2.1.0, MIT, [LICENSE](LICENSE)).

- `upstream/claude-design/` and `upstream/claude-slides/` are the complete, byte-identical `skills/claude-design` and `skills/claude-slides` folders. No host adaptation belongs inside them; `.gitattributes` keeps their bytes on every platform.
- `manifest.json` lists all 57 files with upstream path, byte count, SHA-256, Git blob SHA-1 and mode; each blob was checked against the pinned Git tree when it was fetched. `server/src/modules/artifacts/artifacts.test.ts` re-verifies every SHA-256.
- `distribution/` contains every remaining published file, including the design-system skill, templates and references. `complete-manifest.json` inventories the entire 319-file repository; existing snapshot paths and bytes are unchanged.
- Design retains its original bundled editor. Slides is rebuilt from [recovered named source](slides-source/README.md), including model, compiler, editing and export implementations, with the user's subsequent video removal applied to executable code.

## Native Slides build

`npm run build:slides-editor` compiles `slides-source/main.js` and `slides-source/node/compiler.js` into the ignored `server/assets/slides-editor/` directory. It does not wrap or patch the original editor bundle. Export implementations and PPTX/WOFF2 dependencies load on demand. Run before starting the API directly; the standard server development and runtime image paths already invoke it.

Hashed application-only assets are served at `/artifact-editor/slides-assets/`. Document files, uploads, writes and events retain their existing grant checks. Slides remains an opaque iframe with the original CSP isolation. The build retains inline license notices and the dependency license inventory.

Run `node --test scripts/slides-editor.test.mjs` for source-build, pinned archive and compiler parity checks. `scripts/slides-workspace-benchmark.mjs` uses raw Chromium CDP with a fixed 20-page image fixture; it reports its environment and distinguishes real editor timings from full product acceptance. See `docs/evidence/issue-601/README.md`. No Playwright acceptance is claimed.

## Native adaptations

Host routes live in `server/src/modules/artifacts/` and `src/features/artifacts/`; the Slides build lives in `scripts/build-slides-editor.mjs`. None modifies a pinned upstream input.

| Upstream | LingxiLoop |
|---|---|
| `server.mjs` `Store` on a `project/` folder | `store.ts`: `artifact_files` rows, one transaction per publish (same all-or-nothing `ifMatch` 409, limits and `_files.json` listing); uploads in object storage |
| Random loopback grant in `/<kind>/<grant>/` | `grants.ts`: signed grant bound to person, artifact and access mode; every request re-checks current access |
| Embedded Slides download fallback | `editor-downloads.ts`: the existing `slidesHost.downloads.save` capability saves generated blobs in the browser without entering the upstream fallback dialog |
| `sameOrigin` write check | Grant write mode; Slides uses an opaque sandbox, Design a grant-specific isolated origin for its same-origin child artboards; the main-site page always keeps the opaque CSP sandbox |
| `fs.watch` + poll → SSE `external-change` | Redis `lingxiloop:artifacts` events → the same SSE stream; an editor's own saves are not echoed |
| Content id = first 32 hex of SHA-256 | HMAC of artifact and SHA-256, so a root `/_blob/<id>` is an unguessable per-artifact capability |
| `comments.json` + lock file | `artifact_comments.doc`, locked by row; the comment model functions are ported unchanged |
| `--agent-hook` / `comments --wait` | A sent comment becomes a conversation message to the room's agent |
| `artifact.mjs check <root>` | `check.ts` runs the vendored `artifact.mjs check` unchanged on a temporary copy |
| `SKILL.md` and `artifact-type/reference/` | `skills.ts` registers the SKILL.md text with only "The calls" and "Comments" replaced by native tools; references via `<kind>.read_reference` |
| Local `<root>` folder, `open`, `list`, `cp` | One Design per conversation, Slides per project; Slides design systems stored under project/ds/<namespace> through native tools |
