---
name: lingxiloop-eval-change
description: Implement, review, or verify LingxiLoop's independent black-box Eval package, datasets, suites, baselines, reports, release gates, model isolation, or telemetry contract. Use for changes under eval/ or docs/agent-eval.md.
---

# LingxiLoop Eval Change

`eval/` is an independent black-box package. It must not import AgentOS runtime, prompts, context, kernel, model clients, or control-plane modules.

1. Read `docs/agent-eval.md` and use the `EvalTarget` contract only.
2. Keep Candidate and Judge endpoint, credentials, calls, costs and traces separate. Do not read product model configuration.
3. Version datasets and suites. Promote a reviewed baseline only after inspecting per-case deltas.
4. Persist replay inputs privately; reports and telemetry use bounded, sanitized fields.
5. Use deterministic graders for structural checks and Autoevals with the independent Judge client for semantic checks. Missing scores, usage or baseline compatibility fail closed.
6. Run `npm run eval:check`. For changes outside `eval/`, use `lingxiloop-verify-change` to select the owning checks.

The AgentOS adapter remains type-only until a separate integration implements it. CI runs package checks only; real-model release gates remain manual or reusable-workflow calls with explicit secrets.
