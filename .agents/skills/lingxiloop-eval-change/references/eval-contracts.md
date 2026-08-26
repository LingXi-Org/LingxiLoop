# LingxiLoop Eval Contracts

## Authorities and ownership

- `server/src/eval/contracts.ts` owns the versioned input, observation, trace, dimension, failure-category, and report contract.
- `server/src/eval/evaluator.ts` owns deterministic scoring. A configured required stage must fail when evidence is missing; an unconfigured optional stage remains skipped and must not inflate the score.
- `server/src/eval/trace.ts` owns Host Action allowlisting, RAG metadata extraction, deduplication, truncation, and redaction.
- `server/src/eval/harness.ts` owns baseline validation and run/stage/Case regression checks.
- `server/src/eval/service.ts` and `server/src/db/migrate.ts` own durable Eval ingestion and schema behavior.
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
  --base origin/main --include-worktree --format json
```

Expected focused commands:

- Evaluator/trace/harness/runtime suite: `npm run test:eval` and `npm run eval:check`.
- Eval persistence/API/migration: `npm run test:integration:eval` with dedicated PostgreSQL and Redis.
- Eval Dashboard: frontend typecheck and production build.
- All Eval TypeScript: lint, server typecheck, Agent OS architecture guard, and LLM ledger guard.

Focused means every changed file is Eval-owned: `eval/`, `server/src/eval/`, Eval-specific tests and runners, `src/admin/EvalPage.tsx`, the Eval Skill, or the Eval guide. Do not infer hunk ownership from a shared filename. Changes to Agent OS runtime, DB migration, API/Admin shell, integration infrastructure, root docs, or shared config must fail closed to their owning checks. Package manifests, workflows, and classifier changes run the full matrix once before the dependency/selector change is trusted.

Open Notebook scope, Compose smoke, full serial integration, and Windows/macOS packaging remain path-owned checks for ordinary pull requests. The reusable quality workflow also runs the full matrix for package-manifest or selector changes, `main`, manual, and release callers.
