# with-artifacts source adaptation

Pinned [assistant-ui/assistant-ui](https://github.com/assistant-ui/assistant-ui/tree/ff654d8156680b839774296ef644b57ab1078425/examples/with-artifacts), commit `ff654d8156680b839774296ef644b57ab1078425`, MIT (see LICENSE).

`upstream/` contains every published file of `examples/with-artifacts`. The root license is included separately. `complete-manifest.json` records all 14 files, original paths, bytes, SHA-256 and Git blob IDs. Nothing in the snapshot is modified or run as the product backend.

| Original source | Native adaptation |
|---|---|
| `app/page.tsx` ArtifactExperience + ArtifactScopes | `src/features/slides/SlidesWorkspace.tsx`: conversation and active artifact composition, responsive resizable panels, existing ConversationRuntimeProvider and ConversationThread |
| `app/artifact-surface.tsx` provider, active target, origin and workbench | `src/features/slides/artifact-surface.tsx`: same provider/open/close/origin structure; durable artifact ID instead of an assistant tool-call ID; server checkpoints instead of example in-memory versions |
| `app/toolkit.ts` artifact creation/update | Published LingxiOS native `slides.*` tools in `server/src/modules/artifacts/agent-tools.ts`, with the existing authorization and ledger; example AI SDK transport is not introduced alongside the product runtime |
| HTML artifact preview | Existing opaque `ArtifactEditorFrame`, now with a source-window/nonce checked selection bridge; arbitrary artifact HTML never enters the application's DOM |
| Example `app/api/chat/route.ts` | Existing persisted IM/agent runtime; no extra API key, chat endpoint or model billing path |

The source adaptations retain MIT notices. The complete example remains available for comparison, including its package and configuration files. The product intentionally replaces its generic HTML artifact type with the repository's existing Slides format and editor.
