# Issue #370: retire the orphan CheckpointHistory component

Baseline: `190930ffbd6d2f14d6d2430b6e41e0bdd2373bb9` on
`chore/370-evidence-maintenance`. Inspection date: 2026-10-24.

## Change and reachability evidence

Delete only `src/components/assistant-ui/elements/checkpoint-history.tsx`:
**99 lines, 2,993 bytes**, measured with `wc -lc` before deletion. This removes
unused source maintenance, not a claimed production bundle-size reduction.

- Repository-wide searches for `CheckpointHistory`, `checkpoint-history`, and
  the exported `Checkpoint` type found no current executable consumer outside
  the component itself. The three path/hash entries under
  `docs/evidence/pr227-spa-package/` are historical receipts and remain intact.
- The Web entry is `index.html:37` → `src/main.tsx:14–17` → `App`; the dynamic
  imports name their modules explicitly. No `import.meta.glob`,
  `require.context`, `globSync`, or `glob(` loader was found in `src`, `admin`,
  `electron`, or `vite.config.ts`. Vite's dependency scan explicitly starts at
  `index.html` (`vite.config.ts:36–39`).
- The persisted generative UI registry is explicit
  (`src/lib/nativeMessage.ts:39–56`), and its renderer is derived from that
  registry (`src/features/chat/components/NativeMessageContent.tsx:41–56`).
  Neither registers or discovers this component. There is no remaining tool
  adapter or component import for it.

## Exact retirement history

- [03cfe64f6278e3a16902c03274b667a0bb381a2f](https://github.com/LingXi-Org/LingxiLoop/commit/03cfe64f6278e3a16902c03274b667a0bb381a2f),
  2026-09-03: introduced the component and its tool-card integration.
- [b97299ccb1b15e5a49ef5c9b55119f0380f7684c](https://github.com/LingXi-Org/LingxiLoop/commit/b97299ccb1b15e5a49ef5c9b55119f0380f7684c),
  2026-09-03: removed the import, `CheckpointHistoryTool`, and
  `checkpoint-history` registration from `ToolRenderers.tsx`; changed the
  then-current `teacher_briefing` converter from that card to `showStats`.
  The standalone component was left behind. `git log -S'CheckpointHistory'
  -- src` identifies these two integration changes.

## Retained behavior and candidates

The removed file is a pure view with an optional `onRestore` callback; it has
no subscription, persistence, authorization, or network side effect. Current
message rendering, streaming, cancellation, authorization, and recovery paths
are not edited. No manifest, lockfile, CI configuration, selector, runner,
default test list, or fixture is changed.

- Keep `ProgressCard`: `BusinessMessagePart.tsx:171` actively renders it for
  `tool-activity` data. Its indirect message consumer is still supported.
- Keep `AgentStatus` pending artifact-lifecycle evidence: tracked
  `artifacts/playwright/host-protocol-ui-review/main.tsx:10,587` imports and
  renders it. An unused application import alone would not justify deletion.

## Validation and rollback

On 2026-10-24 the root task ran `npm run lint`, `npm run build` (includes Web
typecheck), and the existing `npm test` Web suite: all passed, with 128 tests,
zero failures and zero skips. Dependencies were installed from the unchanged
lockfile with install scripts disabled. The first install failed because the
default npm cache directory was unavailable; using a task-owned `/tmp` cache
succeeded. No credential, permission or lockfile changes were needed.

Independent consumer/history review found no P1/P2 issue. Final committed-head
CI and review are recorded in the [delivery record](README.md). No new test was
added to mirror the absence of an unreachable component.

To restore exactly the deleted source from the baseline, if required:

```sh
git restore --source=190930ffbd6d2f14d6d2430b6e41e0bdd2373bb9 --worktree -- src/components/assistant-ui/elements/checkpoint-history.tsx
```
