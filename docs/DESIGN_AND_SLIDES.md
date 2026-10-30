# Design and Slides

Design and Slides replace the retired Canvas. Both are native ports of
[baoyu-design](../third_party/baoyu-design/README.md)'s `claude-design` and
`claude-slides`: the upstream file formats, editor pages, checker and skill text
run unchanged; LingxiLoop supplies the storage, authorization, realtime and agent
tools around them.

## Product surfaces

- **Design**: one canvas of artboards per conversation (`project/canvas.json` plus
  one `.dc.html` Design Component per artboard). It opens from the conversation
  header, full screen on desktop and as a drawer on phones.
- **Slides**: decks belong to a project (`project/deck.json` plus one
  `project/slides/<id>.html` per slide) and are listed under 演示文稿 in the main
  sidebar. People create, rename, open and delete decks there; an agent can create
  one from a conversation (`slides.create`). The editor presents and exports PDF,
  HTML and PowerPoint.

The editor page is served at `/artifact-editor/<kind>/<grant>/` and runs in an
opaque-origin sandbox, so neither its code nor an artifact's own scripts can reach
the application session or `/api`. The grant comes from
`POST /api/artifacts/:id/editor-grant`, is bound to the person, artifact and access
mode, and every editor request re-checks the person's current `artifact:read` or
`artifact:write` permission. Uploads are served at `/_blob/<id>`; ids are bound to
their artifact by the host secret.

## Data

Migration `0060_native_artifacts.sql` owns:

| Table | Holds |
|---|---|
| `artifacts` | kind, title, project, optional conversation, save sequence, and the collaboration workspace (goal, status, coordinator, progress card) |
| `artifact_files` | the `project/` files; a save replaces rows in one transaction, conflicting `ifMatch` returns 409 |
| `artifact_blobs` | upload metadata; bytes in object storage under `artifacts/<id>/assets/` |
| `artifact_comments` | the upstream comments document |
| `artifact_agent_assignments`, `artifact_assignment_dependencies`, `artifact_agent_runs`, `artifact_assignment_reports`, `artifact_activity` | multi-agent collaboration migrated from Canvas |

The migration also replaces the agent capability `canvas` with `design` and
`slides`. Canvas tables are not read or written by any code; their retirement is a
separate, destructive migration.

## Agent tools

`design.*` and `slides.*` share one definition (`server/src/modules/artifacts/agent-tools.ts`):

- Files: `current`, `read_file`, `write_files` (whole files or deletions, all or none,
  optional `ifMatch`), `edit_file` (one exact replacement), `import_asset`
  (an attachment becomes `/_blob/<id>`), `check` (the vendored `artifact.mjs check`),
  `read_reference`; Slides adds `create`.
- Comments: `comments`, `comment_reply`, `comment_resolve`. When a person sends a
  comment to the agent in the editor, it arrives as a conversation message naming
  the comment id.
- Collaboration (migrated from Canvas, same semantics): `available_agents`,
  `start_workspace`, `stop_assignment`, `stop_workspace`, `submit_report`,
  `submit_verification`. Report tools are granted only to the matching assigned
  role; verifiers see read tools only. File evidence is referenced by project path
  and re-observed by sha256 at verification.

Skills: `claude-design` and `claude-slides` register the vendored SKILL.md with
its local-CLI sections replaced by these tools; `design-cooperation` and
`slides-cooperation` carry the collaboration rules.

## Checks

- Unit: `server/src/modules/artifacts/artifacts.test.ts` (grants, upload ids,
  layouts, comments, skill adaptation, vendored bytes) and
  `server/src/__tests__/artifact-tool-contracts.test.ts`.
- Integration: `server/src/__integration__/artifact-app-boundary.test.ts` (HTTP API,
  editor routes, save conflicts, grant revocation).
- Native Worker flow: `scripts/test-native-agent-artifacts.mjs` (builder and
  verifier on a Design canvas, rollback, restart, shared state).
