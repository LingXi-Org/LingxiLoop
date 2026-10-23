# #326 failure inventory (before implementation)

Facts: current main selects `deepseek-ai/DeepSeek-V4.1-Flash`; product workers set a 30 s first-byte budget, but only the previous GLM Flash configuration enables streaming for auxiliary review/compaction. A non-streaming auxiliary response cannot report progress within that budget. Main turns already stream. Reproduce the configuration gap using the actual product model configuration against a local provider with delayed auxiliary output and periodic progress; retain request, idle and logical-call deadlines and the three-attempt cap.

Facts: durable failure delivery writes a system terminal message while run projection separately renders an assistant error. Their identities are not currently reconciled by the visible timeline. UI work records its own failure inventory and matches explicit identities only.

Unknown: original request/message/run/attempt IDs, provider category and deployed configuration. These code findings do not confirm the original incident's cause. No private conversation, screenshot or production log is needed for synthetic regression.

Failure cases to verify:

- New default model loses auxiliary progress on the wire and times out despite healthy progress.
- A transient auxiliary 503 must retry only that model call; already completed tools and receipts must not repeat.
- Every HTTP attempt settles once in the shared and native model ledgers; provider text/reasoning/keys must not enter evidence.
- Repeated 503 reaches the cap; quota rejection does not retry; cancellation propagates and does not start a paid call.
- A later user message with identical text still creates a distinct run; replay of the same ingress and terminal identity does not create another run or message.
- Failed/cancelled state remains terminal and visible; revoked project access blocks terminal delivery.
- Request/idle/total deadlines and production authorization are unchanged; no runtime internals are patched and no persistent permission is expanded.
