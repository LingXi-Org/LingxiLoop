---
name: agent-eval
description: Implement, review, or verify LingxiLoop deterministic Agent Eval suites, baselines, trace fixtures, evaluator thresholds, report generation, or CI gates. Use when Agent behavior or Eval artifacts under eval, scripts/run-agent-eval.ts, or scripts/run-agent-runtime-eval.ts change.
---

# Agent Eval

Keep Eval deterministic, reviewable, and safe to upload.

1. Reproduce the product contract with fixed fixtures, stable ordering, fixed time/randomness, and mocked external providers.
2. Score observable outcomes and trace contracts, not implementation trivia. A failed required case must fail the command.
3. Update a baseline only for an intentional behavior change. Review the report diff and state why each changed expectation is correct.
4. Strip prompts, credentials, tokens, personal data, and unrestricted tool output from traces and reports. Keep identifiers synthetic and payloads bounded.
5. Keep both gates: `npm run eval:harness` for the harness contract and `npm run eval:runtime` for the real runtime path.

Run `npm run test:eval` and `npm run eval:check`. Runtime changes also require the relevant PostgreSQL/Redis integration tests. Report suite, baseline, thresholds, failures, and generated artifact paths.
