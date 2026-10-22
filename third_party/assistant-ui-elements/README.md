# assistant-ui Elements

Source: https://github.com/assistant-ui/assistant-ui

Pinned commit: `1de233d61b09f25f7f14df8a9211edb347559902` (retrieved 2026-10-22).

Upstream directory: `packages/ui/src/components/react/assistant-ui/elements/`.

`upstream/task-card.tsx` and `upstream/run-activity.tsx` are unmodified source snapshots. The adjacent `LICENSE` retains the upstream MIT notice, Copyright (c) 2026 AgentbaseAI Inc.

The corresponding files in `src/components/assistant-ui/elements/` are adaptations. RunActivity retains the official controlled disclosure, public activity list, latest step summary and external answer/attention slots. LingxiLoop adds same-panel history navigation, explicit public task navigation and a secondary disclosure for the existing Langfuse waterfall. TaskCard uses the official structure and state icons, with localized accessible state labels, explicit focus styling and narrow-width wrapping. `partial`, `blocked`, and `unknown` preserve the native task outcomes without claiming success. It only receives verified public task records; it does not infer stages from model or tool names. Task links navigate to each once-rendered activity in its original event order.

Both are standalone props-driven React components. They use the existing React/lucide/local surfaces and collapsible primitives; no replacement runtime or package was added. Installed assistant-ui runtime version at integration: `@assistant-ui/react` 0.15.16.

The latest running step shares the compact status row so ending a run does not
remove a line above the answer. Archived entries do not become the current-step
summary. Task inspection opens the existing secondary details and selects a span
already present in the authorized trace; it does not fetch child-run contents.

Official references: https://www.assistant-ui.com/elements/run-activity and https://www.assistant-ui.com/elements/task-card .
