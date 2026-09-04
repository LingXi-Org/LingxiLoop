# LingxiOS v2 event stream

The private control surface exists only below `/internal/agent-os/v2/*`.

Every run emits ordered `AgentRunEvent` records with a per-run `seq`. The
control plane persists events and mirrors user-visible activity to WuKongIM:

- `run.started`, `run.completed`, `run.failed`, `run.cancelled`
- `model.started`, `model.delta`, `model.completed`
- IPython execution and artifact events
- `approval.pending` and resolution events
- handoff and final-message events

Raw Python is folded and redacted by default. Internal events remain in the
run ledger and are not published to learners. Model deltas are ephemeral
previews; the durable final response is a normal `LingxiMessageV1` message and
always wins over previews.

The stable prompt contract is versioned independently from turn data. Policy,
writing behavior, role contracts, the current IPython surface, and persona are
stable; dates, memory, retrieved evidence, attachments, prior messages, tool
results, and current work state are bounded, explicitly untrusted turn data.
Any change in the complete `sourceVersions` map refreshes the stable prompt.
A prompt-contract upgrade also discards old model history so
invalid responses from an earlier contract cannot keep steering new turns;
current durable conversation and product state are projected again as untrusted
context. Optional follow-up questions may remain text after the
requested result is delivered. Questions whose answers block progress must use
`host.chat.ask(...)`, which is the only action that creates a question card and
ends the run until the learner submits it. No redundant text acknowledgement is
generated after the card.

An explicit request to create or revise a weekly learning plan enters the
typed `host.learning` Mission flow. Optional scheduling details do not block a
reasonable provisional plan, and a weekly plan alone does not justify Canvas.
Before any model text enters the user-visible stream, Agent OS rejects and
corrects mixed text/tool responses, reasoning or tool markup, SDK code, opaque
IDs, prose elicitation, and durable-action claims without a successful Host
result.

Each model request exposes one strict `ipython` function with parallel tool
calls disabled. Malformed, unknown, or multiple calls execute nothing and
receive call-ID-matched structured errors for one correction attempt. Python
runner results, stdout, stderr, and artifacts are bounded to 8,000 characters;
the capability/role namespace and method allowlist is enforced again before a
Host Action runs.

Raw L4 run, tool, RAG, LLM, Eval, Safety, Metric and Log records remain in their
own authoritative ledgers. Product HTTP and frontend surfaces cannot read them;
an independently deployed Engineering Control Plane can consume bounded pages
only through `server/src/engineering-control-plane/public.ts`.

Approval-gated Project lifecycle requests carry a typed command rather than a
target status. Resolution rechecks the human authorization principal, invokes
the Project application transition, and records both the transition audit and
durable Learning projection intent in the same transaction.

The browser consumes committed messages from WuKongIM. Ephemeral model output
uses assistant-ui's native `AssistantStreamChunk` protocol over the existing
tenant-scoped Redis/WebSocket broadcast: `step-start`, `part-start`,
`text-delta`, `tool-call-args-text-finish`, `result`, `part-finish`, and
`message-finish`. Retrieved evidence is published first as a completed
`cite_claims` tool result and consumed by the Streamdown text renderer. Knowledge
attribution has one exact representation: a grounded span is the Markdown link
`[claim](#cite-S1)` (or `#cite-S1,S2`), and each referenced ID must have one
matching `cite_claims` result. Streamdown replaces that link with the inline
Confidence element; the durable body retains the same Markdown, so no marker
stripping or claim-text reconstruction exists. Evidence, reasoning, text, and
tool lifecycle chunks all leave Agent OS through the same event endpoint;
source excerpts are removed before the event ledger write. The final WuKongIM
message is accepted only when its body exactly matches every persisted text
delta in the run; missing or malformed streams fail instead of falling back to
direct text.
IPython remains an internal ledger event and never becomes a conversation part.
Only typed `host.*` Host Actions are projected as assistant-ui `tool-call`
parts; the frontend renders those parts with the official ToolCall and
ToolTimeline registry components.
Provider `reasoning_content` is a native `reasoning` part and answer `content`
is a native `text` part; a tool-finish response without a valid tool call fails.
Qwen 3.5 requests disable provider thinking for canonical and provider alias
model names. The adapter also removes the provider's leading reasoning envelope
before the response contract is evaluated, so an orphan closing tag cannot
become conversation content.
History and older-page recovery use WuKongIM's sequence cursor (`beforeSeq`)
through the authenticated IM adapter. They never fall back to a PostgreSQL
message table or a second durable message store.

Stop and Steer use control-plane APIs and the durable run lease. A worker
heartbeat observes cancellation or queued steering without relying on a chat
WebSocket. WuKongIM remains the authority for chat, ordering, read state and
offline synchronization.
