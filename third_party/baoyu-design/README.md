# baoyu-design Design and Slides provenance

Pinned source: [`JimLiu/baoyu-design@c15e76ef5134228d2bb5da35652d30d7d6b8a34d`](https://github.com/JimLiu/baoyu-design/tree/c15e76ef5134228d2bb5da35652d30d7d6b8a34d) (v2.1.0, MIT, [LICENSE](LICENSE)).

- `upstream/claude-design/` and `upstream/claude-slides/` are the complete, byte-identical `skills/claude-design` and `skills/claude-slides` folders. No host adaptation belongs inside them; `.gitattributes` keeps their bytes on every platform.
- `manifest.json` lists all 57 files with upstream path, byte count, SHA-256, Git blob SHA-1 and mode; each blob was checked against the pinned Git tree when it was fetched. `server/src/modules/artifacts/artifacts.test.ts` re-verifies every SHA-256.
- The editor pages (`scripts/editor/`) are upstream's prebuilt bundles; their sources (BaoCut) are not published. Design serves that bundle unchanged. Slides uses the reproducible native build below; the original pinned inputs remain available for comparison and rollback.

## Native Slides build

`npm run build:slides-editor` builds `server/assets/slides-editor/` from the pinned bundle and `host/slides-zh-CN.json`. It translates editor copy (including accessibility labels and starter layouts), initializes the dialog's sheet-measurement dependency before its first hook call, and splits the PowerPoint library and video encoder into on-demand modules. Source-hash and patch assertions stop the build if the upstream contracts change. Run this command before starting the server directly; `npm run server:dev` and the runtime Docker image build it automatically.

Generated, hashed assets are served at `/artifact-editor/slides-assets/` so reopening a deck with a new grant can reuse the browser cache. These routes contain application code only; pages, document files, uploads, writes and events keep their existing authorization. The server still injects the download capability and hashes all inline scripts for the original sandbox/CSP policy. No document contents or enum values are translated.

Focused checks: `node --test scripts/slides-editor.test.mjs`, then `python scripts/check-slides-editor.py` (Python Playwright and Chrome). The browser check uses HTTP fixtures with the real editor inside the product's opaque iframe sandbox; it covers creation, optimistic saves, reload, Chinese menus and lazy PPTX export on desktop, plus the narrow-screen creation flow. `--upstream` reproduces the original crash. Database/ACL coverage belongs to `artifact-app-boundary.test.ts`.

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
| Local `<root>` folder, `open`, `list`, `cp` | One Design per conversation, Slides per project; no design-system folders in this host |
