# #261: observed text during generation and tool failure

The product already transports native public provider text, but a run with no
published body rendered no textual state. Missing script/skill labels fell back
to “处理任务”; a successful save used the same generic completion copy as unrelated
actions. None of these states distinguished stored content from a delivered view.

The server now projects bounded, explicitly labelled task-status text from public
lifecycle and current-request tool receipts. It distinguishes pending generation,
confirmed tool failure, saved content without a delivered reference, a generated
reference awaiting delivery, and terminal missing delivery. Real provider text
replaces the initial waiting explanation immediately and remains interleaved with
tools. Known script/skill/visualization tools have closed, specific copy. The
visualize host instruction explicitly requests useful public text before long HTML
or tool argument generation and observed explanations after failures.

No private model event, reasoning field, argument, path or raw error is exposed.
No generated semantic answer or successful action is invented. Storage completion
is not called successful view delivery. No runtime bump or iframe startup changes.
This cannot force a provider to produce explanatory content or establish a
production latency bound; the actual private incident timing remains uninspected.

Validation on exact published runtime3.6.0:
- New state/copy tests: 3 failed before implementation, 3 passed after.
- State, real AssistantTransport decoder and public-event regression: 13/13 pass.
- Real native Worker + isolated PostgreSQL + published OpenAI driver + local HTTP
  provider: 1/1 pass, 2 model calls, 12 SSE frames. Public text appears before the
  tool starts and after a confirmed visualization-read failure before provider EOF.
  Reconnect replay retains it; private reasoning sentinel never reaches output.
- Server and web typecheck; touched-file Biome lint.

Commands: `node --import tsx --test --test-isolation=none --test-force-exit` with
`observed-progress.test.ts`, `public-events.test.ts`, `assistant-transport.test.ts`;
`npm run test:integration -- --file visualize-failure-public-streaming.test.ts`;
`npm run server:typecheck`; `npm run typecheck`.

The accompanying JSON is synthetic local evidence only; productionRequests=0.

Independent combination review found that a generated reference with public
`delivery: failed` was described as still waiting. A new public-state regression
failed first, then passed after the narrow status correction: failed explicitly
reports non-delivery, only pending says waiting, and not_observed/null remain
unconfirmed. The existing delivered-only renderer gate is unchanged. Combined
projection, transport, public-event and Web harness owning checks passed35/35;
touched-file lint passed. No additional provider or production test was run.
