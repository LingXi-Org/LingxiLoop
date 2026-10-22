# Issue 304: process elements and sources failure model

Written before implementation. Scope: the props-driven RunActivity/TaskCard presentation and public search result metadata; no production calls or private records.

- A search renders the same title/link once in WebSearch and again in Citation/LinkPreview. A successful batch must have only one detailed source list. Uncited hits must remain inspectable.
- URL-only deduplication strips fragments and merges distinct source versions, pages, and excerpts. Only identical bounded public source records may coalesce; version/page/fragment metadata must survive replay.
- A diagnostic trace displaces the public activity list. The original Langfuse waterfall must remain intact behind a secondary disclosure inside the same RunActivity entrance.
- History controls can accidentally appear as a second process entrance. They must render inside the existing activity panel even when its current live list is empty.
- Task UI could turn arbitrary spans or ordering into fictional business stages. Only explicitly identified public tasks with real states are eligible; absent, missing, cyclic, or duplicate parent associations must remain flat. A missing duration must not become a timer or zero.
- Controlled expansion must not change merely because status or entries update. Pending actions and final answers remain outside disclosure; keyboard focus, translated labels and narrow-width wrapping must survive.

Focused static tests cover ownership, source identity and safe tree construction before code changes. Root integration owns official @e2e-dev/web interaction, DOM continuity, narrow/dark/focus/motion and event-stream checks; static rendering is not claimed as browser verification.

Official source verification: assistant-ui/assistant-ui commit `1de233d61b09f25f7f14df8a9211edb347559902`, `packages/ui/src/components/react/assistant-ui/elements/{run-activity,task-card}.tsx`, MIT (AgentbaseAI Inc.). Installed `@assistant-ui/react` is 0.15.16. Both Elements are props-driven and use existing React, lucide-react, local surfaces/collapsible primitives; no new runtime or dependency is required.

## Focused results

The initial RunActivity/ResearchSources regression run failed exactly four new checks: trace hierarchy, history-only navigation, duplicate source links, and merged version/page records. Five pre-existing/control cases passed. TaskCard regression was authored before the component was imported.

After implementation, all 12 tests in `run-activity.test.tsx`, `task-card.test.tsx`, and `ResearchSources.test.tsx` passed using Node 22.23.3 with `--import tsx --test --test-force-exit`. Biome lint passed for the eight changed source/test files; `git diff --check` passed.

Integration contract: `RunActivity.tasks` consumes validated `readActivityTasks(...).tasks`; each entry may carry an explicit `taskId`. TaskCard links target the single event-ordered activity list rather than copying tool forms or moving later calls ahead of commentary. `historyControls` remains inside the main panel; the waterfall remains inside `details[data-slot="run-activity-details"]`. Controlled `open` is never changed by this component on status or entry updates.

These are local controlled/static checks, not production acceptance or the browser interaction results owned by the integration worker.
