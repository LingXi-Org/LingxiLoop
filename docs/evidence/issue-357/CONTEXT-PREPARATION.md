# #357: parallel authorized context preparation

Baseline: product `be301f2b25a7969af92674ada6f542ff0b90eec2`, formal LingxiOS 3.8.5.

The first stage removes a confirmed serialization defect in `createProductContext`. Knowledge search used to wait for roster, learning, Canvas and memory-scope reads, then visualization directory/state and actor/read-receipt work. Search only needs the already-authorized scope and channel history. It now starts at that dependency, while the other required branches run concurrently. The complete context still waits for every required branch.

Admission authorization remains before all preparation. Audience, current source permission, exclusions and source versions are reread; there is no cross-turn context or permission cache. Cancellation and unavailable-dependency classification are unchanged. Agent read receipts still use the existing transactional outbox. Model budgets, protocol, semantic-review policy and runtime package are unchanged.

## Owning verification

- A regression added before implementation held the roster query and required both local text/vector search requests to have started. The baseline failed with `0 !== 2` after a bounded wait.
- The modified real PostgreSQL/local HTTP test passed. Search began 251 ms after context preparation started, before the held roster was released. The context promise remained pending until all required data was available. The deliberately stalled search still respected its five-second timeout (measured assembled preparation: 5279 ms).
- Related current-source authorization, attachment, citation and durable-receipt integration: **15/15 passed**, no skipped cases. This includes cancellation propagation and rollback/replay of read receipts.
- Server typecheck and lint on both changed TypeScript files passed.

These timings are from a controlled local fixture, not a production first-token or browser-paint measurement. There is no user-facing UI change in this stage. The larger issue remains open pending the separately investigated evidence/tool round trips and actual first useful answer behavior; this preparation improvement alone does not establish that a long production wait is resolved.

## Frozen evidence across tool turns

The second stage consumes the public `ContextProvider` preparation hint proposed
by [LingxiOS PR 56](https://github.com/LingXi-Org/LingxiOS/pull/56). The control
plane reauthorizes the durable session before creating this hint. Only nonempty
evidence for the same work's first request version qualifies; no hint is read
from user or tool metadata. The product still executes current scope/audience
checks and all other context preparation, but skips automatic retrieval whose
replacement evidence the runtime would otherwise discard. A new request,
revised requirements or empty evidence follows the ordinary retrieval path.

The added PostgreSQL regression first failed with two redundant searches instead
of zero, then passed after implementation. It also proves that current independent
context still loads, the product does not fabricate copied evidence, and old-work
or revised hints do not suppress search. The runtime regression covers forged
metadata, current source revocation, a new work and an empty snapshot. The public
type and end-to-end hint propagation require formal runtime 3.8.6; the staged
product code must not be released against 3.8.5.

Runtime evidence preparation keeps whole short excerpts in a bounded large
catalogue and preserves range metadata when read results are bounded. A matching
synthetic model/tool scenario against 3.8.5 and the candidate used 8 versus 3 model
calls, retaining one save, one read-back and a truthful final outcome, with no
auxiliary review. These counts do not establish a production latency improvement.

## First-turn retrieval on demand

The third stage changes the product harness policy. An ordinary interactive turn
with no attachment or registered source-dependent workflow no longer starts
text/vector retrieval before the model. `on_demand` means retrieval has not run;
it is not an empty result or an unavailable service. Authorized knowledge tools
remain present, and the instructions require their use before asserting facts
that depend on course or case sources. There is no additional model router,
fast-model path or language-keyword authority decision.

Revised requests, supplied attachments, homework/Canvas/delegated work, non-interactive work and
registered learning, homework, case, takeover or intervention context retain
automatic source preparation. Workflow classification is read from the current
authorized database scope, not cached permissions. Ordinary teacher operations
do not acquire a source obligation merely because the room belongs to a course.
The changed harness version and course-evidence skill version participate in the
runtime binding; release must drain old work or preserve its original runtime,
not bypass a binding mismatch or reset its budget.

Revisions conservatively retain preparation because a steering message can add
an attachment to the durable request without changing the initial work metadata.
The ordinary-room revision regression failed with zero searches instead of two
before this boundary was added; no arbitrary metadata flag opts a revision out.

The prior behavior failed a regression requiring zero unsolicited searches
(`2 !== 0`). Owning PostgreSQL tests preserve supplied-attachment retrieval,
registered case source-version checks, source/audience revocation, real
`unavailable` results from explicit tools, frozen evidence, cancellation and
durable read-receipt recovery. This eliminates an avoidable first-turn dependency
for ordinary questions. It does not prove that a long multi-source production
request now reaches its first useful answer within a specific time.

## Timing interpretation

The existing runtime `input.loaded` diagnostic measures initial context duration. Provider `providerFirstContentMs` can include process text, so it is not equivalent to first useful answer. Public answer events can identify the first answer segment, but unavailable event timestamps or browser paint times must remain unknown. No missing historical timestamp is reconstructed from duration or sequence numbers.
