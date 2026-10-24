# Issue 355 — work categories in the waterfall

The default waterfall rendered `row(root, 0)`, putting every real step below one collapsible “运行” root despite already having trusted `kind`/`workKind` fields. The view now keeps the real run summary independently inspectable and groups only its direct child spans by their recorded type. Each actual child tree remains intact; group headings introduce no span, parent, time, duration, cost or completion claim.

Categories cover model calls, tools, skills, retrieval/reading, recorded subtasks and otherwise recorded Agent spans. A filter retains necessary ancestors; explicit task inspection resets that filter and expands only the selected span's actual ancestors. Routine replay retains collapse state. Failed attempts with separate identities and unknown historical endpoints remain separate and unchanged. No API, schema, runtime dependency, model prompt, ledger or authorization changes.

## Validation

- Failure model and red regressions preceded implementation. Static rendering reproduced the missing sections; both official browser cases failed at the same missing category assertion.
- Owning waterfall and terminal checks: **6/6 passed**.
- Official `e2e` / `@e2e-dev/web`: initial full run **2/2 passed**, normal exit 0, with light/390 px and dark/1440 px views, retry/failure identities, real child folding, filter ancestry, historical null clocks and history reload equality.
- Additional cross-filter task navigation coverage first exposed an ambiguous fixture selector (two task buttons); it was narrowed to the real “查看调用” accessible name without changing product code. The next official report records **2/2 passed**. Its launcher received the coordinated resource-stop signal around completion and exited 130; this is not represented as a normal successful command exit. Its report and synthetic screenshots are in `browser/`.
- Web typecheck and focused lint passed. E2E typecheck reported three new fixture JSON typing errors; explicit JSON serialization and nullable DOM fields fix those types. Final E2E typecheck remains for the integrator's serialized check; it has not been rerun locally after that fixture-only correction.
- Local production build was stopped before completion at the integrator's request because concurrent compilers were exhausting shared memory. No successful local build is claimed; existing CSS warnings had appeared before stopping.
- No production access, deployment, paid model call, private conversation or private screenshot was used by this implementation. Screenshots contain synthetic fixtures only. Exact-head CI and independent review remain integration gates.

## Reproduce

Use the pinned existing dependencies. Run the owning checks with:

```sh
node --import tsx --test src/components/trace-waterfall/trace-waterfall.test.tsx src/components/trace-waterfall/trace-terminal-states.test.tsx
npm run typecheck
npm run test:e2e:typecheck
```

Start the isolated Vite fixture using `e2e/vite.react-activity.config.ts` on a free loopback port, then use the official engine:

```sh
E2E_BASE_URL=http://127.0.0.1:5355 E2E_PROJECT=web E2E_TELEMETRY_DISABLED=1 \
node node_modules/e2e/dist/cli/bin.js run e2e/web/trace-categories.e2e.ts \
  --workers 1 --retries 0 --output .e2e/issue355
```

The fixture uses the real AssistantTransport/store/NativeMessageContent path. No external product API or provider is needed.
