# Open-source RunActivity waterfall (#283)

## Failure model (written before implementation)

- Mistaking sequence numbers, delivery/observer time, ledger insertion time or text deltas for execution timestamps; replay then changes the waterfall. Unknown offsets and terminal time must remain unknown.
- Zero-default ledger rows masquerading as measured tokens/free cost. Only measured usage and an actual nonzero pricing snapshot qualify; derived prices remain labelled estimated.
- Inferring parentage from temporal overlap, tool names or a handoff request. Only explicit authorized child traces may nest; missing children must not be invented.
- Leaking provider reasoning, prompts, raw arguments/results, internal events, secrets, principal IDs, or a different tenant/run/session through a trace. Reuse public tool display and recheck run bindings; select only numeric/model ledger fields.
- Duplicate/out-of-order updates, stale optional reads, cancellation, failures or waiting states leaving an endless clock; missing terminal timestamps must not be replaced by Date.now().
- Breaking #279 answer/process separation, approval/recovery visibility or #280 purpose behavior. Add a disclosure slot without changing text/tool-purpose classification.
- Empty histories hide the disclosure; huge histories exceed the native message structural budget; min-width causes mobile overflow; transitions ignore reduced motion; UI selection/collapse disappears on every tick.

## Plan and evidence boundary

After screenshot comparison, use Langfuse's non-ee MIT core TimelineRowMetrics/bar-row presentation at 4a8541413b2b2cda7f368215f1c26fc62bfb4bc5. Adapt to nullable relative timing and existing product colors; retain its license. Initial AgentPrism draft was removed after actual pixel review. Build the containing compact tree, metrics, selection, clock and safe detail UI independently. No affectUI paid source/assets/keys are used.

Regression specifications are written before implementation: public trace projection and scoped ledger read; native streaming/history/cancellation; official @e2e-dev/web keyboard, tree, dark/light, mobile, running/frozen clocks and screenshots. Synthetic renderer children prove UI capability, not production child-event availability. Exact upstream LLM offsets/terminal times and authorized child discovery require public runtime contracts; report gaps rather than infer them.

## Implemented product bridge

`RunStreamProjection` emits a bounded `metadata.custom.runTrace` DTO, inside the existing authorized native snapshot/SSE/history route. Existing tool activity provides real absolute start/end timestamps and public I/O; the adapter converts those to relative milliseconds. LLM reads use the shared **product** `llm_calls` ledger, rechecked against company/run/agent/principal/session and noninternal binding. No raw extras, error messages, prompt or reasoning columns are selected. The existing 100 ms optional presentation deadline remains shared by tool and LLM reads; stale reads cannot overwrite a newer request/fence/lifecycle. No schema or dependency change.

Measured usage is exposed only when `measured` is true. Ledger cost is exposed only alongside measured usage and a valid nonzero stored pricing snapshot; it keeps the estimated label. Root sums remain unknown if any LLM metric is missing or the trace is truncated. Tool costs are unknown. No sequence, ledger insertion time or event-arrival time becomes an execution offset.

The UI uses Langfuse's MIT non-ee row metrics/bar presentation, independently composed with a keyboard tree, CSS motion/reduced motion, selected safe details, clock and slowest measured call. It is a RunActivity disclosure child. Existing process/text-purpose classification, substantive answer streaming and tool/approval/recovery controls are unchanged.

## Final local validation

- Web smoke plus existing ConversationMessage regressions: **81/81** passed.
- Server smoke plus new projection/scoped-ledger regressions: **119/119** passed.
- Official `@e2e-dev/web` renderer cases: **5/5** passed (four 390/1440 px light/dark cases plus a long-tree scrollbar geometry case); the four theme/width cases cover, light/dark; keyboard branch fold, selected I/O, advancing/stopped clock, cancellation/failure, replay, one external answer and no horizontal overflow/private fixture strings.
- Web, server and E2E TypeScript checks passed; web/server lint exited successfully (existing web warnings/info only); `npm run build` passed with existing CSS highlight/chunk warnings. `git diff --check` passed.
- Browser evidence is from the isolated local Vite fixture and owning synthetic projection snapshots, not a real model/database/worker. Production bundle build is checked separately.
- Before-code regression source and failure model were written first. The initial red command could not load `tsx` until dependencies were installed; do not count that as a behavioral red test. A later animated-collapse regression was caught by E2E (descendants still considered visible despite clipped height), fixed with visibility/inert/aria-hidden, then all four cases passed.

Plain-text check logs (`*.txt`, ANSI/trailing whitespace normalized), source-manifest.json and hashed screenshots are alongside this file. Initial implementation: `87bac5844e8cf351383c02a89dc700965238d3e0`; screenshot-review geometry/legibility fix: `18c88ae0`. Subsequent merge from main adds only deployment evidence, and follow-up evidence commits do not change source. The browser report's recorded VCS parent predates the uncommitted visual fix; source-manifest.json and the geometry-fix commit provide source traceability. A parent independent review and exact-head CI remain release gates.

## Remaining blocker; issue stays open and PR stays draft

The original bridge targeted runtime 3.6.0; this branch now retains main's formal **3.7.0 reader** dependency and purpose behavior. Neither of those contracts exposes trustworthy LLM offsets, settled run end time or authorized child-span discovery. The product's usage callback has actual latency but no actual start/end timestamps. This branch therefore cannot claim complete real-time per-LLM/subagent parity for new runs. The precise required public contract is in [native-contract.md](native-contract.md) and the #283 coordination comment. It must be added/integrated for new runs and verified with real native stream/replay; legacy records remain honestly unknown. Renderer-only synthetic child spans prove UI folding, not production lineage. Model in-flight clocks and fully measured root terminal duration depend on that contract.

No production conversations, restricted production HTML, deployment, purchase, Pro install/access-key transfer, runtime publication or merge was performed. Parent-thread messaging through the environment agent tool failed with `tunnel_client_not_seen`; the public issue comment and contract document completed the coordination handoff without retrying or bypassing that service failure.

## Screenshot review corrections (failure model before the visual fix)

Parent review found nested list margins narrowing descendant lanes while geometry
still used the root width, so the final purple bar could extend past its actual
row. The root domain already visits all descendants, but it also needs to include
known starts and retain right-side headroom. Text was placed on 8px bars, producing
poor dark-theme legibility; move duration to a dedicated aligned column. Keep the
slowest marker inside its row. A shared axis/row viewport must account for the
vertical scrollbar, and tree guides must not change track width or origin.

Before editing the renderer, extend official browser regressions to assert real
DOM geometry: shared lane origins/widths at every depth, matching start/end scale,
all descendant endpoints inside the axis with a right gutter, unclipped duration
text outside the bars, and an inline slowest badge. Add a synthetic descendant
ending after its recorded parent to prove the domain visits the entire tree.
This renderer stress fixture does not claim native production span availability.


### Correction results

`18c88ae0` fixes all four parent screenshot-review findings. Every descendant uses
the same absolute lane origin/width as the axis; tree guides stay inside the name
cell, and axis/rows share a scrollbar viewport. The domain covers every recorded
start/end even while collapsed, with 8% display headroom. Durations/costs now use
a separate 72px column with theme foreground text. The slowest call is a small
inline badge, without an extra row. Unknown historical data stays unknown.

Five official browser cases passed. Numeric geometry is retained in
`geometry-browser-tests.txt`: mobile lanes share x=158.59375 and width=116.40625;
desktop lanes share x=632.59375 and width=422.40625. A synthetic descendant ends at
2200 ms after its parent ends at 1000 ms; the axis ends at 2376 ms, leaving about
9px (narrow) / 32px (desktop) after the last bar. Start/end positions agree with
the axis scale within 1px, all duration glyph boxes fit within their cells, and
folding the parent preserves the global domain. A 30-row scroll case confirms
axis/row alignment when the vertical scrollbar is present.

All four expanded screenshots were opened and visually inspected. Corrected
expanded/collapsed screenshots and the long-scroll screenshot replace the earlier
product evidence. Web tests remain 81/81; web/E2E typecheck, lint and production
build passed after the visual fix. Server behavior is unchanged; its prior
119/119 receipt remains applicable. New native timing/lineage remains pending in
[LingxiOS #40](https://github.com/LingXi-Org/LingxiOS/issues/40).

Library replacement was attempted once, for the existing four product image IDs
with expected version 0. The current Library skill's required batch helper
returned `hosted apps tools/call HTTP 401` before reporting any successful write.
No new version is confirmed; earlier product Library IDs must not be presented as
corrected images. No direct-upload fallback/retry was attempted. The corrected
PNG files are published in this PR's `product/` evidence directory; the parent
can use its functioning Library connection to save those exact reviewed files.

## Coverage-refresh P2 (failure model before the fix)

A successful optional read can be followed by a matching-revision failure or
100ms timeout after another model call. Keeping the old `presentationAvailable`
true incorrectly presents old cached spans as complete current root totals.
Keep confirmed span metrics but downgrade coverage on a current failure, yielding
null root input/output/cost and `presentation-unavailable`; a later success may
restore coverage. Check request/fence/lifecycle/signal before either mutation.
Also fence concurrent reads: an older failure must not replace a newer success,
and an older success must not promote coverage after a newer failed refresh.
Aborted or superseded reads must leave the current projection untouched. Verify
these paths with a queued optional-reader fixture before changing server code.
No renderer/provider rerun is required for this server-only correction.


### Coverage-refresh correction results

Fixed the review P2 in `782350a334dcef0200a91389605b772e61a82c3c`.
`syncPresentation` now checks request/fence/lifecycle, signal and a monotonic read
revision before either coverage downgrade or restoration. A matching failed
optional read keeps confirmed old spans but marks presentation unavailable;
root input/output/cost become null, and a subsequent matching success restores
totals. Older concurrent failures cannot invalidate newer successes, and older
successes cannot promote coverage after a newer failure. Aborted reads and
superseded request/fence/lifecycle reads leave the current projection unchanged.

The before-code reader fixture reproduced five failing paths on the previous
code; after correction all ten cases pass. Full server smoke plus trace and
socket regressions passed **130/130** before syncing the new reader main.
After merging `37b8d70d211da4e1b44a6ff35ddf4e4d532ada47` and installing its exact
formal `@lyyzka/lingxios` 3.7.0 lock, the coverage + native public-purpose +
deployment/profile combination passed **15/15**; server typecheck and lint passed.
No UI source changed in this correction, so the reviewed geometry screenshots
and 5/5 browser receipt remain applicable; no provider/browser rerun was needed.
`coverage-*.txt` contains the red/green and combination receipts.

The native author fixed a separate public trace contract proposal at
https://github.com/LingXi-Org/LingxiOS/blob/c4b6df3/docs/public-run-trace/contract.md :
complete replacement snapshots from `readRunTrace(identity)`, explicit opt-in
`{type:'trace',trace}` SSE, immutable span/parent identity, actual epoch timing,
usage/cost nulls, authorized child coverage, revocation and truncation boundaries.
That implementation remains unpublished; no unpublished runtime source is
installed in this product branch. The author will add its server bridge on this
final UI/coverage head. #283 remains open pending formal package, bridge,
combined real native stream/replay verification and release review.
