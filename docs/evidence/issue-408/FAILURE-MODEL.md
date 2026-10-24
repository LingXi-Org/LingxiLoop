# Issue 408: executing identity versus historical self-description

Baseline: `1725df4c7751f9ff38fe1e3d3983b465393d9d8c`.

The report observes correct sender/run identity with incorrect first-person text. It does not establish authorization bypass or a shared-session collision. Before changing product behavior, exercise the formal locked LingxiOS 3.8.11 with synthetic participants and inspect current persona, historical authors, compiled model inputs, persisted session partitioning and delivered sender.

Hypotheses: (1) persona is only preference data and lacks a clear current-executor binding; (2) history/delegation loses author attribution; (3) remembered/compacted first-person material displaces current persona. The local old 3.5.2 source is not evidence of 3.8.11 behavior. The formal package now installed confirms native conversation messages replace the host's temporary messages and delegation preserves its author; cache/session keys include agent identity. Do not infer collision from the shared room alone.

Minimal checks before implementation:

- A three-turn real Worker fixture: trace introduces itself, nova plans a lesson with trace in room history, then milo accepts practice with both peers in history. Later turns also carry an attributed historical quote. Current authorized persona and historical author identity must reach the model; delivered sender and session state must retain the acting agent.
- A scripted model establishes request/authorization/ledger wiring only. It cannot establish semantic identity correctness.
- An opt-in real-provider run uses the existing configured provider credentials only in process memory, records aggregate usage and bounded synthetic answer classifications, and preserves failures. A passing baseline means this sample did not reproduce the report; it does not close the issue.

No production accounts/data, credential creation, authorization changes, mentions/delivery/handoff changes or deployment. Preserve the #398 homework-help implementation. Provider settings and installed versions must be reported accurately; this environment's configured model is GLM-5.2, not a claim about the production model.

Falsification and remaining scope:

- A missing/wrong current persona before generation would implicate product context loading. The observed three personas were correct.
- Peer self-introductions entering the current agent's assistant history would implicate serialization or partitioning. The scripted final request preserved peer user-data attribution and separate session ownership. This does not cover a restored or compacted long session.
- A real response with the current persona present but another member's self-description would support a model-input priority hypothesis. The bounded samples did not show that failure; presence of the current name and a few wrong-self-claim patterns are heuristics, not an exhaustive semantic judge.
- The browser fixture deliberately renders a milo message saying “我（溯源）”. It verifies that sender chrome remains 砺思 and the body is retained through JSON replay. This corroborates the boundary; it does not reproduce the generator defect.
- Memory/compaction injection, production model/version parity and explicit handoff to sage remain unverified. Follow-up needs a privacy-safe minimal history plus model/runtime metadata and memory-scope/compaction state from the original report, coordinated with the relevant owners.

No production fix is justified by these samples. Keep #408 open. The draft adds reproducible investigation coverage only; `context.ts` remains byte-for-byte unchanged, including #398.
