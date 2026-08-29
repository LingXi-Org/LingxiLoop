# LingxiLoop Eval Contracts

## Authorities and ownership

- `server/src/eval/contracts.ts` owns the versioned input, observation, trace, dimension, failure-category, and report contract.
- `server/src/eval/evaluator.ts` owns deterministic scoring. A configured required stage must fail when evidence is missing; an unconfigured optional stage remains skipped and must not inflate the score.
- `server/src/eval/trace.ts` owns Host Action allowlisting, RAG metadata extraction, deduplication, truncation, and redaction.
- `server/src/eval/harness.ts` owns baseline validation and run/stage/Case regression checks.
- `server/src/eval/service.ts`, `server/src/db/schema.sql`, and `server/src/db/bootstrap.ts` own durable Eval ingestion and reset-only v1 schema behavior.
- `eval/suites/` and `eval/baselines/` are reviewable, versioned test data. `scripts/run-agent-eval.ts` replays frozen observations; `scripts/run-agent-runtime-eval.ts` runs the current Agent OS before evaluation.

## Suite and baseline decisions

Add a Case when introducing a supported behavior, covering a fixed bug, or protecting a failure boundary. Prefer small orthogonal Cases over one fixture that asserts many unrelated behaviors.

Use frozen observations for evaluator mechanics only. They prove that scoring, failure classification, comparison, and report generation work; they do not prove the current Agent runtime still behaves correctly.

Use deterministic runtime Cases for merge gates. Each Case should:

- run `AgentOSRuntime` with the in-memory Host and scripted model seam;
- assert required system-instruction and model-item fragments so prompt/context wiring affects the result;
- cross the actual IPython/Host Bridge/Approval boundary when that behavior is under test;
- avoid wall-clock-sensitive scoring, external model calls, and network access;
- convert the captured runtime outcome/actions/events into the same `EvalObservation` contract as persisted runs.

Use model Eval for semantic qualities that deterministic checks cannot judge reliably. Record model and prompt versions, pin inputs and evaluator configuration, budget cost, and keep the run manual or scheduled by default.

Baseline changes require an intentional reviewed result. Preserve `referenceVersion`, per-dimension reference/minimums, per-Case reference/minimums, and `maximumScoreDrop`. Inspect regressions by Case and dimension before updating. Do not overwrite history or hide a missing/failed Case by loosening its floor.

## Trace and persistence safety

The desired trace is:

`test input -> Agent decision -> model call -> IPython cell -> Host Bridge action -> Approval or Canvas worker -> final answer`

Capture actual runtime status and duration where the runtime exposes them. Evaluator execution duration is not Agent stage latency.

For `knowledge.search` and automatic knowledge context, retain only identity and traceability metadata such as sourceId, chunkId, marker, title, position, count, and bounded status fields. Drop excerpts and retrieved source content before the observation reaches a report or database write.

For other tools, use explicit bounded sanitization. Redact keys matching secrets/tokens/authorization/cookies, content/body/messages, stdout/stderr, HTML/Markdown, and payloads. Limit depth, item count, string length, and object key count. A sanitizer test should use unmistakable sentinel text and assert the serialized observation and artifact do not contain it.

Dynamic `knowledge.search` results must merge with automatic citations and deduplicate by sourceId, chunkId, and marker. Answer citation scoring must resolve only markers present in the sanitized citation metadata.

## Comparison and CI

Every report should identify target commit, prompt version, and model. Compare two targets at run, dimension, and Case levels, and retain categorized failures such as missing RAG source, bad citation, wrong tool, Approval violation, routing/Canvas failure, timeout, and cost regression.

Run the classifier before choosing checks:

```bash
node .agents/skills/lingxiloop-verify-change/scripts/classify-change.mjs \
  --path eval/suites/example.v1.json --path server/src/eval/example.ts --format json
```

Local direct evidence:

- Evaluator/trace/harness/runtime implementation: task-path lint and `npm run test:eval`.
- Public type or authoritative Agent OS/LLM contract inputs add their owning typecheck or guard.
- Eval persistence, production build, full Eval gate, and service-backed evidence remain CI-owned.

Task scope contains only files written during the current task. Completed commits and unchanged local work are not reclassified. Package manifests, workflows, and selector changes still request the full CI matrix.

Open Notebook scope, Compose smoke, full serial integration, and Windows/macOS packaging remain path-owned checks for ordinary pull requests. The reusable quality workflow also runs the full matrix for package-manifest or selector changes, `main`, manual, and release callers.
