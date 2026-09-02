---
name: agent-runtime
description: Implement, debug, refactor, or review LingxiLoop Agent OS runtime behavior, work leasing, retries, kernels, Host Bridge actions, message delivery, or LLM ledger integration. Use when changes touch server/src/agent-os, server/agent-os, Agent work items, or Agent runtime contracts.
---

# Agent runtime

Trace the work item from claim through model turn, `ipython`, Host Bridge effects, ledger writes, and final message before editing.

## Preserve contracts

- `ipython` is the only model-visible tool. Do not expose product or network tools directly.
- Product effects cross the authenticated Host Bridge and repeat server-side authorization using the acting user, company, project, and run.
- Claims use leases; retries are bounded; attempts are idempotent; stale owners cannot commit results.
- WuKongIM is the durable message source. PostgreSQL stores Agent work, audit, and LLM ledgers rather than shadow chat history.
- Every LLM path uses the shared client and records success/failure, model, tokens, latency, tenant scope, and correlation identifiers without prompt secrets.
- Kernel and Agent home isolation must survive cancellation, timeout, restart, and concurrent runs.

## Verify

Add deterministic integration coverage for changed runtime behavior and update Agent Eval when user-visible decisions or traces change. Run `npm run server:typecheck`, the owning unit and integration files, and only `npm run eval:runtime` when runtime decisions or traces are affected. Never run the complete test or Eval suites for a localized change.

Report lease/retry impact, Host Bridge authorization impact, ledger impact, and the exact failure behavior.
