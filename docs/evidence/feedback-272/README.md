# System skills: selected complete context

Issue: https://github.com/LingXi-Org/LingxiLoop/issues/272
Base: `63948c59`. Runtime stays published `3.6.0`; no schema, dependency, model-window or client changes.

## Cause and change

The unchanged visualize body is 35,718 UTF-16 characters / 35,734 UTF-8 bytes. The runtime bounds tool output to 8,000 characters. Previous product instructions required reading 4,000-character observation ranges in separate responses. The complete normative text therefore cost a selection call plus roughly ten page turns before authoring. Its upstream silence/reload instructions also conflicted with this host's public progress behavior. The supplied screenshot supports repeated reads, not a measured elapsed time or a proven broken runtime cursor.

All seven registered built-in skills now use one mechanism: select an exact current index once with native `skills.load`; the next prompt supplies that selected body directly. Unselected skills remain absent. Native `visualize.read_reference` with exactly `SKILL.md` also selects the current registered visualize body, covering that existing route. Native tools remain available and unchanged in authority.

`ProductRuntimePolicy` uses public `executionSnapshot` and `TurnContext.executionSteps`. A completed native call is a demand signal only. The host matches current request version, exact name/version/hash, current registered harness index, and current permitted actions. It then supplies bytes from trusted definitions, never instructions parsed out of tool results. A failed or truncated redundant result cannot replace those bytes and is never presented as a successful read. Repeated selections supply one copy. Compaction and restart recompile the same authorized selection without an observation cursor.

The registry is read once with the deployed module. Runtime `skillIndex` binds content and version; prompt identity includes the full selected text. There is no cross-user document cache or cache-hit claim. Each individual skill and the aggregate selected rules are bounded; oversized input fails rather than silently losing constraints. The vendored body is unchanged. Explicit Web adaptations override upstream silence/compaction-reload and executor-only mechanics while retaining all authoring constraints and existing delivery activation.

## Validation

- First wrote `FAILURE-MODEL.md` and failing owning tests. Six public-API tests cover long complete content, all seven skills, demand selection, repeated selections, current request filtering, failed/truncated previews, stale versions, hash invalidation, compaction reconstruction, authorization revocation and fast/chat mode narrowing.
- Five existing observed-progress regressions passed with these six (11/11).
- True published-worker / PostgreSQL / local HTTP OpenAI-driver fixture exercises full skill in subsequent prompts, substantive public SSE before selection/save, save/read/verified final, and failed-reference fallback. It separately probes native truncation, a repeated range, EOF, and out-of-range rejection. Results and exact parameters are recorded in the adjacent JSON artifacts.
- `npm run server:typecheck`; `npm run server:lint`; `git diff --check` passed. Independent source review found no blocking issue and independently ran the six unit checks. Its total-rule-bound suggestion was fixed and the new boundary regression went red then green.

Local scripted-provider results (not a production before/after benchmark):

| Scenario | Skill/reference/page reads | Model calls | First substantive SSE | Verified delivery |
| --- | ---: | ---: | ---: | ---: |
| On-demand skill | 1 / 0 pages | 4 | 753ms | 4818ms |
| Skill selection + failed optional reference | 2 / 0 pages | 5 | 512ms | 5098ms |
| Deliberate pagination compatibility probes | 15 / 14 ranges | 18 | 666ms | 13613ms |

The artifact's historical fixture label `redundant-load-failure` means one truncated skill-selection result followed by one failed reference read; it does not mean two skill-load calls. The compatibility scenario deliberately tests a large range, repeats a range, and probes EOF/error, so its timing is not an old-version baseline. All three save and read the actual scoped HTML and deliver a verified final reference.

Repeat owning checks with a dedicated migrated integration database:

```sh
node --import tsx --test --test-isolation=none --test-force-exit server/src/__tests__/visualize-skill-loading.test.ts server/src/__tests__/observed-progress.test.ts
npm run test:integration -- --file visualize-skill-loading.test.ts
```

## Limits and handoff

- Timings are local deterministic-provider measurements, not production speed claims. No paid provider or private production content was used. Scripted model behavior proves the transport/context path, not natural model compliance or absence of every possible unnecessary read.
- The supported system-skill path is native `skills.load`, explicitly advertised in the host. Conversation execution already disables Python. This patch does not parse arbitrary legacy Python code to infer a hidden skill selection or change the generic runtime observation protocol.
- Complete selected text consumes context. A synthetic all-capabilities 128K/default-output fixture was rejected by existing mandatory-context limits; a visualize-only 128K/default-output fixture also hit its limit later. Those scalar diagnostics are retained. The passing small-HTML fixture uses 128K with 4,096 output tokens, explicitly recorded. Existing product SiliconFlow configuration already advertises 1M; this PR changes none of those values. Unrelated tool-catalog/window budgeting is not silently solved here.
- Shared files with the separate saved-but-not-delivered task: `visualize-skill.ts` (host text) and `visualize-tools.ts` (descriptions only). No save/read implementation, final verifier, path authorization, geometry or iframe loader changes. The designated integrator owns merge and production rollout.
