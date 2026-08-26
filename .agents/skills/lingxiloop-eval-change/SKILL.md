---
name: lingxiloop-eval-change
description: Implement, review, or verify LingxiLoop Agent Eval suites, baselines, deterministic runtime gates, evaluator contracts, trace ingestion and sanitization, Eval persistence, or the Admin Eval Dashboard. Use for changes under eval/, server/src/eval/, Eval scripts/tests, Eval API/DB surfaces, or Eval Dashboard paths; use when an Agent OS, prompt, RAG, tool, approval, Canvas, or multi-Agent change needs regression coverage.
---

# LingxiLoop Eval Change

Build Eval evidence that can detect a regression in the current Agent behavior, keep observations safe to persist, and run only the owning CI scope.

## Workflow

1. Read [references/eval-contracts.md](references/eval-contracts.md) before changing a suite, baseline, runtime observation, persistence, or comparison behavior.
2. Invoke `$lingxiloop-verify-change` and run its classifier against the intended diff. Confirm Eval paths produce `ci.eval=true`; an Eval-focused diff should produce `ci.evalFocused=true`, `ci.integration=eval` when persistence changes, and no Compose/Desktop/Open Notebook signal unless their owning paths changed.
3. Choose the lightest truthful execution mode:
   - Use frozen inline observations only to test evaluator, parser, sanitizer, gate, and report semantics.
   - Use the deterministic Agent OS runtime harness for merge-blocking behavior coverage. Exercise the real runtime with `MemoryHostAdapter`, `ScriptedModelDriver`, and a deterministic Kernel/Host seam; do not call external models or networks.
   - Use real-model Eval only for prompt/model quality that deterministic assertions cannot represent. Keep it manual or scheduled unless an explicitly provisioned stable CI contract exists.
4. Add or update a versioned Case when behavior, a failure mode, or a production bug is newly in scope. Keep inputs, expectations, scenario identity, and thresholds reviewable in `eval/suites/`.
5. Update a baseline only after the new behavior is intentionally accepted. Never raise/lower a baseline merely to silence a regression. Compare run, dimension, and Case deltas before accepting it.
6. Preserve the real trace chain: input, decision, model hop, IPython cell, Host Bridge action, Approval/Canvas activity, and final answer. Use runtime durations when available; do not substitute evaluator compute time.
7. Sanitize before persistence or report creation. RAG results may retain sourceId, chunkId, marker, title, position, and bounded status/count metadata, but never excerpts or retrieved content. Allowlist ordinary tool results and redact secrets, authorization, message bodies, stdout/stderr, and oversized payloads.
8. Run focused evidence from the matrix below and report which scopes were intentionally skipped. Expand to the full matrix only when `$lingxiloop-verify-change` classifies another domain or the user asks for it.

## Focused verification

Run these for every Eval change:

```bash
npm run guard:brand
npm run guard:agent-os
npm run guard:llm-tracked
npm run lint
npm run server:typecheck
npm run test:eval
npm run eval:check
```

Add `npm run typecheck && npm run build` for the Eval Dashboard. Add `npm run test:integration:eval` when Eval migration, API, service, or persistence behavior changes. The classifier is the source of truth for whether full unit, full integration, Compose, vendored Open Notebook, or desktop packaging is also required.

## Completion bar

- `eval:check` includes both the frozen harness self-test and a deterministic real Agent OS runtime gate.
- Runtime fixtures fail when required prompt/context input, routing, RAG, tool selection, or Approval behavior no longer reaches the model/runtime seam.
- Artifacts identify commit, prompt, and model targets and expose per-stage and per-Case regressions.
- Stored and generated observations pass excerpt/secret checks.
- CI uploads both Eval reports and runs only the classified scope on pull requests; `main`, manual, and release callers retain the full matrix.
