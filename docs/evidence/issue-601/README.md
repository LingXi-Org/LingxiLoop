# Slides workspace (#601)

Development base: `6dccecaac52e0f281263ee24ee1789151c5ed962` (includes #600).
This branch is an independent draft; the parent task owns integration and production.

## Fixed sources

- assistant-ui/assistant-ui `ff654d8156680b839774296ef644b57ab1078425`: complete `examples/with-artifacts` and root MIT license, inventoried in `third_party/assistant-ui-with-artifacts/complete-manifest.json`.
- JimLiu/baoyu-design `c15e76ef5134228d2bb5da35652d30d7d6b8a34d`: complete published repository, inventoried in `third_party/baoyu-design/complete-manifest.json`. Existing `upstream/claude-design` and `upstream/claude-slides` paths and bytes are preserved; remaining repository content lives in `distribution/`.

## Planned owning boundaries

- `src/features/slides/`: source-adapted with-artifacts workbench, existing conversation runtime, safe editor frame.
- `third_party/baoyu-design/slides-source/`: reconstructed editor modules, design system, compile/export implementation. Generated output is separate; builds must not depend on the upstream editor bundle.
- `server/src/modules/artifacts/`: deck conversation binding, comments/context, conflict checks, durable versions and restoration.
- One next-numbered migration for deck sessions and version history; legacy artifact files and source conversations remain intact.
- `server/src/agent-runtime/context.ts`: read authorized deck-specific context only. SDK/tool-contract/skill-loading changes owned by #596 are not part of this branch.

## Acceptance status

Implementation and verification are in progress. No functional or performance acceptance is claimed by this document. Baseline and candidate results must identify their actual scope (isolated editor fixture versus full authenticated product), device/network, raw repetitions and unmeasured items. A simulated server fixture is not evidence of production latency or model behavior.
