---
name: agent-eval
description: Implement or verify the independent black-box Eval package, versioned datasets/suites, jobs, baselines, Autoevals grading, telemetry and release gates.
---

# Black-box Agent Eval

1. Work only through `EvalTarget` in `eval/src/contracts.ts`. Never import product runtime, prompts, context, kernel, model client, control plane or databases. `eval/targets/agent-os.ts` is a type-only integration placeholder until separately authorized.
2. Run `npm ci --prefix eval` then `npm run eval:check`. Tests use local HTTP servers; they are infrastructure verification, never Candidate quality baselines. No browser automation.
3. Candidate and Judge use explicit independent `EVAL_CANDIDATE_*` and `EVAL_JUDGE_*` configuration. Use Autoevals with an instance client, never globals, provider fallback or product credentials.
4. Live evaluation is explicit: follow `docs/agent-eval.md`. Never claim API validation without running it. Missing credentials/prices, unknown usage, incomplete jobs, evaluator errors and incompatible baselines must block release.
5. Version dataset/suite content immutably. Promote eligible completed runs only with a review reason; never replace an existing baseline. Review portable baseline files before using them in CI.
6. Persist bounded synthetic identifiers, scores, usage and failure codes in telemetry/reports; no raw prompts, answers, secrets or unrestricted error messages. Private local SQLite includes dataset inputs for reruns and must not be uploaded as a public artifact.
7. Report only owning tests, gate outcomes and material limitations. Agent runtime coverage belongs to its own integration tests, not an internal Eval adapter.
