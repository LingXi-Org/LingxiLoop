# Issues 215 / 218: public activity and memory cards

Baseline: `b7b165fd704f8d1f22fe8b70b47bfc8d70e02275`; deployed product pin
`2ea8615c`, published runtime `3.5.6`, product migration 46. Issues 215, 218
and coordination issue 216 were read on 2026-10-20; all had no comments.

## Failure inventory (before implementation)

- Product has no QueryClientProvider: a successful memory receipt throws in
  useQueryClient. Previous fixture added its own provider and masked the defect.
- Empty memory looks like an absent card; loading and fetch failure can appear
  as confirmed old facts. Retry, read-only history and multiple cards must work.
- A query result from another principal/project/run/thread or old document
  version can be reused; late requests can outlive a session teardown.
- Runtime 3.5.6 emits dotted action names. Product nativeTool schemas use `__`
  names; history and presentation must consistently normalize known aliases.
  Exact supported actions missing from the copy catalog lose their semantics.
- A complete progress receipt can still be hidden while the next tool runs.
  Newest public commentary/reasoning/plan must use the real part renderer.
- Collapsing/reopening, failure, cancellation and replay can duplicate or hide
  public explanations; final answers and actionable cards must remain visible.
- Same public report ID in a new attempt can overwrite previous attempt content.
- Candidate previews are retractable, not committed public statements. Preserving
  them after discard would violate runtime authority and the issue's constraints.

## Coordination boundary

Runtime 3.5.6 `src/runtime/runtime.ts` / `src/ui/index.ts` publishes candidate
body previews and discards them on tool transitions, invalid protocols, provider
retry and terminal failure. The public API does not expose an independently
committed incremental public-commentary channel. Full #215 requires an upstream
public contract and official release coordinated with #216. This branch must
not patch the dependency or retain discarded drafts. Existing explicit
`chat.report_progress` receipts are already durable, authorized public content.

Browser fixtures use synthetic public receipts and API outcomes to isolate
rendering. They are never real-provider or real-backend acceptance evidence.

## Implemented slice

- Reproduced the actual MemoryTool exception in the browser after removing the
  fixture-only provider: `No QueryClient set, use QueryClientProvider to set one`.
  The feature now owns the real provider and an auth-cleared query client.
  Cache keys include company, principal, project, agent, conversation, thread,
  run and chip versions. Loading, empty, error/retry and read-only history retain
  the existing API authorization and message error boundary.
- Inventoried 79 registered product actions and 18 runtime built-ins. Known
  dotted/`__` aliases share the closed display catalog and rich-card dispatch;
  persisted generic titles are refreshed without replacing specific old titles.
- Latest explicitly committed public explanation renders once through the actual
  Message/Reasoning primitives in the official RunActivity attention slot.
- Complete official WebSearch source is connected to safe search receipts;
  MemoryChips and ErrorState use their full official integrations. Cancelled and
  unknown results are distinct from failure, including research/retrieval cards.

## Verification and measured limits

All browser runs use `tester-army/e2e` 0.17.0 with `@e2e-dev/web` 0.12.0 and
Chromium 154 at the same local Vite fixture. Runtime is the exact published 3.5.6.

- Baseline memory and default public explanation browser cases failed as expected.
- Memory/privacy + new regression browser suite: **7/7 passed**; authorized
  successful/empty/loading/error/retry, forgetting, read-only, refresh, narrow and
  wide layouts, and visible public explanation through stop/failure/completion.
- Web tests: **65/65 passed** after final product edits.
- Server tests: **106/106 passed** in the final full rerun (158.5 s).
- Published-worker integration: **2/2 passed** (`public-run-activity.test.ts`,
  `native-memory.test.ts`), using real disposable PostgreSQL/Redis/runtime and
  explicitly scripted model/fake WuKong transport. This is not live-provider E2E.
- Web build/typecheck, server typecheck, E2E typecheck and Web/server lint passed.
  Web lint has five existing warnings/two infos; build reports existing CSS
  highlight/chunk-size warnings. No checks or valid assertions were deleted.
- Same-condition public receipt short measurement: before status 61.7 ms, public
  text still hidden after 1200 ms; after status 194.2 ms, receipt-to-paint 154.5 ms.
  Files `timing-before.json`/`timing-after.json` retain scope and foreground state.
  These are synthetic client receipt measurements, **not submit-to-first real
  provider text**. Final state regression and reference-site results are separate.

Reproduce (start Vite on 5193 and a Chromium CDP endpoint on 9227):

```sh
E2E_TELEMETRY_DISABLED=1 E2E_ACTIVITY_FIXTURE=1 E2E_MEMORY_PRIVACY_FIXTURE=1 E2E_BASE_URL=http://127.0.0.1:5193 E2E_CDP_URL=http://127.0.0.1:9227 node e2e/web/run.mjs e2e/web/activity-regressions.e2e.ts e2e/web/memory-privacy.e2e.ts --output .e2e/215-218-memory
E2E_TELEMETRY_DISABLED=1 E2E_ACTIVITY_FIXTURE=1 E2E_BASE_URL=http://127.0.0.1:5193 E2E_CDP_URL=http://127.0.0.1:9227 node e2e/web/run.mjs e2e/web/activity-presentation.e2e.ts --output .e2e/215-218-presentation
node e2e/server/run.mjs --file public-run-activity.test.ts --file native-memory.test.ts
```

## Pending handoff (do not close issues from this slice)

Latest comments were re-read at 02:39 UTC on 2026-10-20. Initial no-comments
observation above predates the new integrator reviews.

1. #215 complete incremental public content requires the coordinated upstream
   public contract described above. No runtime, lockfile or migration change here.
2. Confirmed source gaps from the new #215 review remain: `public:${entry.id}`
   deduplicates across attempts and can overwrite old explanation/state; recent-20
   run discovery can miss older failed/cancelled activity. Use durable attempt
   identity and authorized IM run anchors/pagination; increasing LIMIT is not a fix.
   Neither pending edge is claimed as accepted by this draft.
3. No live-provider credentials were available in this worktree; real submit-to-
   first-text timings and provider lifecycle acceptance remain for the integrator.
4. Official-site screenshot navigation failed due to Chromium certificate trust.
   Source comparison is complete, but live website/product visual comparison is
   still pending. No security bypass was attempted.
5. Memory domain/old-card migration and revocation contract remain coordinated
   with #216. This slice intentionally uses only the currently published API.

The cloud exec transport disconnected once, then actual commands confirmed
recovery. Parent instructed checkpoint + draft PR before further development.
No merge, deployment, issue closure, credentials or production data were changed.

Checkpoint `9932774d`: the final expanded catalog/lifecycle and receipt timing
browser run **3/3 passed**. It covers eight distinct known tools, dotted/legacy
aliases, old generic metadata, full official source/memory cards, details,
running/failure/cancellation/unknown, and 390/1440 layouts. The real unknown
receipt carries `isError=true`; its card stays “结果待核对” without false failure
or blind retry. Legacy terminal status stays visible even without an attention
annotation. The final fixture measurement was status **70.8 ms** and public
receipt-to-paint **24.9 ms** (`timing-checkpoint.json`). This still measures only
client synthetic receipt rendering.

Preliminary selector/attention failures and a local Vite connection-refused run
are retained under `.e2e/215-218-*`; none were converted to passing by deleting
assertions. The separately failing live official-site certificate case remains
unresolved and is retained in `browser-presentation-including-reference-failure.md`.


On the same product candidate `9932774d`, the seven original local RunActivity
browser cases also passed (73.93 s): light/dark at 390/1440, Markdown/KaTeX/Mermaid,
approval attention, failure/reload, 300-call expansion, authorized 1100-entry
activity paging and font loading. This page-within-a-run coverage does not prove
the pending cross-run recent-20 recovery edge. Candidate Web/E2E typechecks and
scoped lint passed again. The final evidence-only commit changes no product code.
