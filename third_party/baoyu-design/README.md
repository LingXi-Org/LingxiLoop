# baoyu-design Design and Slides provenance

Pinned source: [`JimLiu/baoyu-design@c15e76ef5134228d2bb5da35652d30d7d6b8a34d`](https://github.com/JimLiu/baoyu-design/tree/c15e76ef5134228d2bb5da35652d30d7d6b8a34d) (v2.1.0, MIT, [LICENSE](LICENSE)).

- `upstream/claude-design/` and `upstream/claude-slides/` are the complete, byte-identical `skills/claude-design` and `skills/claude-slides` folders. No host adaptation belongs inside them; `.gitattributes` keeps their bytes on every platform.
- `manifest.json` lists all 57 files with upstream path, byte count, SHA-256, Git blob SHA-1 and mode; each blob was checked against the pinned Git tree when it was fetched. `server/src/modules/artifacts/artifacts.test.ts` re-verifies every SHA-256.
- The editor pages (`scripts/editor/`) are upstream's prebuilt bundles; their sources (BaoCut) are not published, so they are served unchanged.

## Native adaptations

All of them live in `server/src/modules/artifacts/` and `src/features/artifacts/`; none modifies a vendored file.

| Upstream | LingxiLoop |
|---|---|
| `server.mjs` `Store` on a `project/` folder | `store.ts`: `artifact_files` rows, one transaction per publish (same all-or-nothing `ifMatch` 409, limits and `_files.json` listing); uploads in object storage |
| Random loopback grant in `/<kind>/<grant>/` | `grants.ts`: signed grant bound to person, artifact and access mode; every request re-checks current access |
| `sameOrigin` write check | Grant write mode; the page runs in an opaque-origin sandbox (iframe `sandbox` plus a CSP `sandbox` directive on the page) |
| `fs.watch` + poll → SSE `external-change` | Redis `lingxiloop:artifacts` events → the same SSE stream; an editor's own saves are not echoed |
| Content id = first 32 hex of SHA-256 | HMAC of artifact and SHA-256, so a root `/_blob/<id>` is an unguessable per-artifact capability |
| `comments.json` + lock file | `artifact_comments.doc`, locked by row; the comment model functions are ported unchanged |
| `--agent-hook` / `comments --wait` | A sent comment becomes a conversation message to the room's agent |
| `artifact.mjs check <root>` | `check.ts` runs the vendored `artifact.mjs check` unchanged on a temporary copy |
| `SKILL.md` and `artifact-type/reference/` | `skills.ts` registers the SKILL.md text with only "The calls" and "Comments" replaced by native tools; references via `<kind>.read_reference` |
| Local `<root>` folder, `open`, `list`, `cp` | One Design per conversation, Slides per project; no design-system folders in this host |
