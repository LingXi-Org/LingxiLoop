# #373 fixed source and reuse map

LingxiLoop implementation base: `2686f475eac075bc9033f13714d5d6bbfa5078eb`.
Reference: [Caho1/open-claude-ui](https://github.com/Caho1/open-claude-ui/tree/c1f923ae0051a871941b98a0e2e3183a545e6a85)
at `c1f923ae0051a871941b98a0e2e3183a545e6a85`, read on 2026-10-24.
Its README describes reverse-engineering; repository MIT licensing does not
establish independent provenance for reconstructed proprietary fragments.
No open-claude-ui code, proprietary assets or extracted constants are copied.

| Reference file at that fixed commit | Classification and local decision |
| --- | --- |
| `code-examples/ArtifactsSplitPaneResizer.tsx` | Behavior reference only. Its active-drag iframe handling prompted an installed-component audit. Reuse the existing `react-resizable-panels` Group/Panel/Separator and its own pointer-event handling/keyboard support. Local learning fixture checks the keyboard path; drag requires its own observation. No copied collapse thresholds, physics or controller. |
| `code-examples/ModelSelectorEffort.tsx` | Capability-configuration reference only. Its illustrative effort choices are not a provider contract. Keep formal LingxiOS/provider settings; students describe their requested help in the existing editable input, independently of effort. The persistent hint/explain/check shortcuts from #373 were retired in #446. |
| `code-examples/RichComposerWithMentions.tsx`, `useClaudeScrollPinning.ts`, `ThinkingAccordion.tsx` | Issue-specified behavior references for the input/viewport owner. Local Lexical composition guard and assistant-ui viewport remain authoritative. Keep user-controlled process disclosure and body-first delivery. Record the owner's inspected files and actual checks in #373 evidence. |
| `code-examples/cds-theme.css`, `ContainerResponsiveBar.tsx`, `docs/v1/01-设计哲学与设计令牌体系.md` | Visual/layout reference only. Map hierarchy and container fit to existing host semantic tokens, brand and primitives; preserve GenUI's scoped theme. |
| `code-examples/ChatComposerChin.tsx`, `docs/v2/02-新增特性深度逆向.md`, `docs/v2/03-架构重构与对比分析.md` | Issue comparison prompts, not proof of persistent recovery or runtime compatibility. Use Lingxi's actual scoped draft, native state, outbox and recovery owners. |

Direct local reuse includes assistant-ui's public composer/runtime and viewport,
Lexical, the existing body/process/attention projection, native approvals and
questionnaires, canonical Canvas editing/revision/feedback scope, presentation
versions and the official MCP App bridge. The ZCode GenUI adaptation retains its
separate pinned source and license inventory in
`src/features/chat/visualize/ADAPTATIONS.md`. #373 adapts that existing component
through its guarded page operation; it does not replace the guest bridge.

## License record

[Reference LICENSE](https://github.com/Caho1/open-claude-ui/blob/c1f923ae0051a871941b98a0e2e3183a545e6a85/LICENSE),
recorded for attribution and future source review: MIT License,
Copyright (c) 2026 Caho1. The linked fixed license governs permitted reuse and
requires retaining its copyright/permission notice with copied substantial
portions. This change uses independently implemented behavior and existing local
components; it vendors no reference-project files.
