# Issue 120 verification

## Official source and product adaptations

Registry source is pinned to assistant-ui commit
`5402b93a1e991d0a3e44e253d7bd67880931c835`.
The files in `upstream/` are the unmodified reference source from
`packages/ui/src/components/react/assistant-ui/` at that revision, including
the RunActivity integration example. They are retained for a reproducible diff.

| Official element | Product path under `src/components/assistant-ui/` | Intentional adaptation |
| --- | --- | --- |
| RunActivity | `elements/run-activity.tsx` | Original disclosure, status announcement, latest activity, attention and final-answer slots; native metadata selects their contents. |
| Reasoning | `elements/reasoning.tsx` | Full root, trigger, content, text, fade, preview and scroll behavior; Chinese labels and native Markdown text. |
| ToolCall | `elements/tool-call.tsx` | Chinese labels; explicit incomplete/failed outcome avoids a false success checkmark; visible keyboard focus. |
| ToolGroup | `elements/tool-group-primitives.tsx` and `tool-group.tsx` | Full official primitives with a compatibility wrapper and Chinese count. |
| ToolTimeline | `elements/tool-timeline.tsx` | Real native tool records, Chinese summary, visible keyboard focus; no fabricated file statistics. |
| AgentPlan | `elements/agent-plan.tsx` | Chinese labels; completed step count from public report; stopped runs cannot keep showing a running spinner. |

The official CollapsibleRoot and layout-effect utility are included. Product
composition uses `PartByIndexProvider`, native status, and the existing part
renderers, preserving attachments, sources, business cards and subtask messages.
No runtime implementation is copied or imported through private paths.

## Recorded checks

- Web, server and E2E TypeScript checks passed.
- Scoped Biome lint passed (two informational suggestions in verbatim upstream
  SwapLabel fragments; no lint warnings or errors).
- Four pre-implementation projection regressions passed: explicit public
  explanation identity/order/replay, anti-impersonation, 300-call retention,
  and filtering of private diagnostics.
- `public-run-activity.test.ts` passed through the published 3.3.6 worker and
  a dedicated PostgreSQL database. `runtime.json` records its assertions.
- Migrations 0034–0036 applied, followed by a second no-op migration pass;
  `migrations.json` records the commands. 0034/0035 belong to the other issues.
- Official `@e2e-dev/web` browser suite passed at 390×960 and 1440×960,
  light and dark: native final answer, keyboard disclosure, plan progress,
  reasoning KaTeX, Mermaid SVG, no horizontal overflow, approval/error visibility
  and replay. Six official component-page reference screenshots were captured
  at 1440×960.
- Two additional browser checks passed: expanded ToolGroup/ToolCall with
  recorded 0.5-second fixture duration and all 300 historical calls revealed
  in order. Browser fixtures are explicitly synthetic, not model evidence.
- The real-provider gate passed with DeepSeek-V4-Flash: six measured model calls,
  $0.01346871, an actual `files.list` execution, public plan and explanation,
  authoritative final answer and replay. `live.json` and `live-run.json` contain
  the structural evidence and budget. Three earlier diagnostic attempts are
  retained: one revealed ambiguous completed-step instructions, one exposed
  a fixture ingress option that differed from production, and one omitted the
  requested separate public explanation. They are not counted as passing runs.

The `browser/` images contain the official reference pages and product states.
Reference pages retain their own demo animation state; they are visual source
references, not an assertion of pixel-identical page layouts. Product changes
are limited to the adapters above, Chinese copy and the existing theme tokens.

## Reproduction

The cross-review follow-up adds regression coverage for 1,100 tool calls and
110 attention records without raising the native 512-part/50,000-node limits.
All calls are accessible through authorized pages; the answer and attention
entry remain outside the activity disclosure. Eight targeted transport/projection
checks and the new browser paging check passed. The public runtime integration
also passed the HTTP page, wrong-tenant, wrong-thread and wrong-Project checks.
The teacher grant owning test passed with the production assembled harness.
The complete teacher integration file passed 12 of 13 tests; its concurrent
provisioning test hit an existing `participants_pkey` conflict in unchanged
teacher provisioning code. That independent failure was handed to the release
owner and is not counted as passing.

KaTeX CSS is imported as a Vite module so its font URLs are resolved from the
package directory. A production fixture build emitted the hashed font assets;
the browser font check explicitly loads `KaTeX_Main` through the preview server.

```powershell
npm run typecheck
npm run server:typecheck
npm run test:e2e:typecheck
# In one terminal:
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5187 --strictPort
# In another terminal:
$env:E2E_BASE_URL='http://127.0.0.1:5187'
$env:E2E_ACTIVITY_FIXTURE='1'
npm run test:e2e:web -- e2e/web/run-activity.e2e.ts --output .e2e/activity
```

Use the repository integration runner with a dedicated, migrated test database
and Redis namespace for `public-run-activity.test.ts`. The independently gated
real-provider check is `node e2e/server/run-activity-live.mjs
--live-public-activity`; it reads candidate credentials from `eval/.env.local`
or `EVAL_ENV_FILE`, keeps them in memory, uses one model worker and a $0.25 run
budget, and writes only structural observations and measured usage. It never
treats a skipped or failed model run as passing. Synthetic transport uses the
existing fake WuKong client; real WuKong delivery is a separate product gate.
