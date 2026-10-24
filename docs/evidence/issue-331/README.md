# Incomplete answer presentation

Issue: <https://github.com/LingXi-Org/LingxiLoop/issues/331>.
Base: `3d0d9f4ffa2f8e865d152180b4e4ee3f7bb9b523`; published runtime 3.8.2.

## Confirmed product defect

The published `consumeAssistantMessage` and `consumeRunState` APIs preserve the
native `partial` and `blocked` lifecycles. The product previously displayed its
incomplete-answer notice only for `succeeded` with an empty answer. Separately,
assistant-ui's error primitive handles `incomplete/error`, whereas the product
correctly projects partial/blocked goals as `incomplete/other`. Those gates miss
the actual terminal state. Nonempty text is also not evidence that the requested
goal was satisfied. An empty result can lack a recovery action entirely.

The candidate uses one quiet status line and the existing guarded new-message
retry action for native and historical partial/blocked results. Text and artifacts
remain visible. It does not display technical diagnostics or process reasoning in
the answer, automatically continue work, or change public-text supersession.

This is a reproducible presentation defect. It does not explain the model's
earlier failure to produce the requested deliverable, and is not evidence of
lost SSE data, provider outage, a token limit, or a defective correction budget.

## Runtime safety regression

The added `protocol-promise` scenario uses the published Worker and HTTP driver,
real isolated PostgreSQL, a synthetic provider and recording IM. It emits two
invalid protocol envelopes and then a valid promise-only answer. Content review
reports the missing requested deliverable. The existing shared correction
ceiling deliberately terminates with partial, three generation calls, two review
calls, zero content repairs and zero visualization writes. The retained answer
is delivered once. Repeated public projection reads preserve content and status
without another model call or delivery.

The small aggregate receipt is [promise-partial.json](promise-partial.json).
It is synthetic evidence, not an original-case diagnosis. Runtime dependencies,
resource budgets, authorization, cancellation and tool execution are unchanged.

Reproduce the seven Worker scenarios and blocked public-reader boundary:

```sh
node e2e/server/run.mjs --file visualize-incomplete-conversation.test.ts
```

Local owning checks pass: the seven Worker scenarios plus blocked reader (one
integration test, no skips), server typecheck and server lint. The final local
runner receipt is `.e2e/issue-331-server-final/server-targeted-validation.json`.
Browser red/green and UI checks are recorded in [UI-FAILURE-MODEL.md](UI-FAILURE-MODEL.md).

## Original-case acceptance

The sole publisher's scoped MCP diagnosis confirms the reported run ended
`partial/inconclusive` because content acceptance exhausted its correction
budget. Review found both the requested explanation and visualization missing;
the final message was delivered with three text parts. No identifiers or original
content are reproduced here. This is a backend incomplete result, not evidence of
a network disconnect. Why preceding generation produced plans instead of a useful
answer still requires the scoped protocol/skill evidence. Another failed protocol
run is being tracked separately by the parent task.

This candidate fixes the confirmed presentation boundary and preserves bounded
runtime behavior. It does not close the complete delivery issue by itself. The
sole publisher owns combined release and production acceptance. This task makes
no production reads; private text, screenshots, raw traces and credentials are
excluded from the branch.
