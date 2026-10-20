# #245 — failure model (before implementation)

- The product rule suppresses narration for all memory work, including an explicit human request to inspect memory. Public text must be allowed before a tool and between observed results, without disclosing hidden reasoning or inventing results.
- Public instructions kept only in an optional skill may never reach the model's first tool turn. The assembled product context must carry the rule; routine background memory remains private.
- Native `content` deltas may be held until a model/tool/final turn ends. Exercise the published OpenAI driver with a local gated SSE provider, real Worker, PostgreSQL and product SSE; require committed, visible prefixes before releasing provider gates. Never pass `reasoning_content` to public text.
- A second public explanation can hide the first behind RunActivity, reorder tools, or leave a legacy aggregate control visible for another count. The real React tree must render both explanations and memory tool updates in place without aggregate activity controls.
- Removing history UI must retain ordinary error and approval cards, cancelled state, and final-answer deduplication. The bounded server audit endpoint remains available; no unbounded message or automatic history fetching is introduced.
- Reconnect must reproduce the durable public prefix during a blocked provider turn. Retain existing cancellation, revocation, unsafe-suffix, attempt/fence, approval and delivery regressions.

No production mutations, credentials changes, paid model requests, runtime forks or schema changes are needed. Synthetic provider text proves transport behavior and instruction presence, not production model compliance or a production latency percentile.
