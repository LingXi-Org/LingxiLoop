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
- Official `@e2e-dev/web` renderer cases: **4/4** passed at 390/1440 px, light/dark; keyboard branch fold, selected I/O, advancing/stopped clock, cancellation/failure, replay, one external answer and no horizontal overflow/private fixture strings.
- Web, server and E2E TypeScript checks passed; web/server lint exited successfully (existing web warnings/info only); `npm run build` passed with existing CSS highlight/chunk warnings. `git diff --check` passed.
- Browser evidence is from the isolated local Vite fixture and owning synthetic projection snapshots, not a real model/database/worker. Production bundle build is checked separately.
- Before-code regression source and failure model were written first. The initial red command could not load `tsx` until dependencies were installed; do not count that as a behavioral red test. A later animated-collapse regression was caught by E2E (descendants still considered visible despite clipped height), fixed with visibility/inert/aria-hidden, then all four cases passed.

Logs and hashed screenshots are alongside this file. The browser report's recorded VCS base predates the uncommitted implementation; screenshot hashes and the subsequent commit provide source traceability. A parent independent review and exact-head CI remain release gates.

## Remaining blocker; issue stays open and PR stays draft

The **current published runtime 3.6.0** does not expose trustworthy LLM offsets, settled run end time or authorized child-span discovery. The product's usage callback has actual latency but no actual start/end timestamps. This branch therefore cannot claim complete real-time per-LLM/subagent parity for new runs. The precise required public contract is in [native-contract.md](native-contract.md) and the #283 coordination comment. It must be added/integrated for new runs and verified with real native stream/replay; legacy records remain honestly unknown. Renderer-only synthetic child spans prove UI folding, not production lineage. Model in-flight clocks and fully measured root terminal duration depend on that contract.

No production conversations, restricted production HTML, deployment, purchase, Pro install/access-key transfer, runtime publication or merge was performed. Parent-thread messaging through the environment agent tool failed with `tunnel_client_not_seen`; the public issue comment and contract document completed the coordination handoff without retrying or bypassing that service failure.
