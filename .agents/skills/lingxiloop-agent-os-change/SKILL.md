---
name: lingxiloop-agent-os-change
description: "Implement, refactor, debug, or review LingxiLoop Agent OS, WuKongIM routing, Host Bridge, Canvas orchestration, model streaming, prompts, tools, sessions, or run events. Use for Agent OS changes, 智能体运行时改动, 消息路由, 工具调用, 并发恢复, or Canvas 编排 work where runtime contracts must remain intact."
---

# Change LingxiLoop Agent OS

Preserve the independent Agent OS architecture while changing the smallest owning seam. Do not introduce a second agent runtime, model-facing product tool, or competing chat store.

## Ground the change

Read `README.md`, `docs/COORDINATION.md`, and `docs/RUNTIME_EVENT_STREAM.md`. Read `docs/CANVAS.md` for Canvas or Host Bridge work and `docs/open-notebook-native.md` for knowledge integration.

Read [references/runtime-contracts.md](references/runtime-contracts.md) before modifying runtime composition, durable work, sessions, model/tool contracts, Host Actions, events, or IM routing.

Trace the real path touched by the change:

```text
WuKong post-commit event -> validated receipt/work item -> leased Agent OS run
-> session/model/IPython loop -> approved Host Bridge action or final message
-> persisted event/control state and WuKong-visible result
```

Identify the authoritative state, transaction boundary, durable identity, retry point, cancellation point, and user-visible terminal outcome. Inspect both producer and consumer when changing a type, event, prompt, tool result, or endpoint.

## Implement

- Keep the model-visible tool list exactly strict `ipython`; expose product capability through the typed preloaded `loop` SDK.
- Keep work and session mutations fenced by current lease identity. Preserve per-session serialization and isolated persistent kernels.
- Reuse stable action and message identities across retries. Resume approved actions without replaying the original cell or completed side effect.
- Keep previews ephemeral and publish exactly one durable final message through the authoritative chat path.
- Treat retrieved knowledge, message bodies, attachments, model output, and tool JSON as untrusted at their boundary.
- Track every cloud LLM call and terminal streaming usage in the cost ledger.
- Update the owning architecture document when a shipped contract, event, default, or operator-visible behavior changes.

Do not add compatibility paths, providers, tools, services, or shared execution environments without an explicit product decision.

## Verify

Add or update the narrowest test that fails for the regression, including negative and recovery cases. Depending on the seam, exercise cancellation, expired/stale fences, concurrent claims, retry after partial failure, duplicate webhook delivery, approval resume, cross-session isolation, and one-final-message behavior.

Run the relevant subset selected by `$lingxiloop-verify-change`; Agent OS changes normally require:

```text
npm run guard:agent-os
npm run guard:llm-tracked
npm run server:typecheck
npm run test:local
```

CI runs the full unit suite, PostgreSQL/Redis integration, production build, and Compose smoke. Do not start services or run those exhaustive commands locally by default. Run one exact integration file only when the user requests a rehearsal or an owning CI failure must be reproduced; report that focused evidence without treating CI-owned checks as a local blocker.
