# Agent Eval

LingxiLoop Agent Eval is a deterministic regression system with a frozen evaluator/harness self-test, a real deterministic Agent OS runtime gate, and persisted reports produced through trusted CLI/service entry points. It covers eight product capabilities:

1. Agent answer quality;
2. teaching quality, concept coverage, explanation, and understanding checks;
3. RAG retrieval and citation traceability;
4. tool selection, arguments, order, and execution result;
5. Approval boundaries and deterministic safety rules;
6. task completion and required artifacts;
7. multi-Agent participation, handoffs, completion, and parallelism;
8. latency, Token, model/IPython/tool-call efficiency, and cost.

Each case flows through `ingest → answer → teaching → RAG → tools → safety → task → collaboration → efficiency → aggregate`. A missing optional stage is reported as `skipped`; a stage named in `requiredStages` fails when it has no observable evidence. Reports are immutable and grouped by `suiteKey`, which makes scores comparable across `version` values and explicit Commit/Prompt/model targets.

## Local and CI regression harness

The repository contains two versioned smoke suites and baselines:

- `eval/suites/smoke.v1.json`
- `eval/baselines/smoke.v1.json`
- `eval/suites/runtime-smoke.v1.json`
- `eval/baselines/runtime-smoke.v1.json`

Run only the gate for the suite you changed:

```bash
npm run eval:harness  # evaluator/harness changes
npm run eval:runtime  # Agent OS runtime changes
```

`eval:harness` replays frozen observations to verify evaluator, sanitizer, comparison, and report semantics. `eval:runtime` runs the vendored LingxiOS `AgentRuntime` with the repository's in-memory Host, scripted model, and deterministic Kernel/Host Bridge seam before generating observations. Its Cases cover automatic and hybrid evidence, strict IPython and Host Action behavior, Approval boundaries, learning planning, and the Canvas report completion gate. The runtime model asserts current prompt and model-input fragments, so broken prompt/context wiring, routing, RAG, tool selection, or Approval behavior can fail the gate without a live model, network, or external account.

Both CLIs compare the run, every observed capability, and every Case against their baseline, append GitHub Job Summary tables, and exit non-zero for a threshold failure or regression. They write `artifacts/eval-harness-report.json` and `artifacts/eval-runtime-smoke-report.json`; CI uploads whichever scoped report was generated.

The generic CLI entry is:

```bash
npx tsx scripts/run-agent-eval.ts \
  --suite eval/suites/smoke.v1.json \
  --baseline eval/baselines/smoke.v1.json \
  --report artifacts/eval-harness-report.json
```

The trusted runtime CLI uses `runtimeScenario` identifiers from its versioned suite. That field is rejected by the generic Eval contract and is not a remote code-execution surface.

Pull requests and `main` run only the Eval gate selected by changed paths. The repository-local `$agent-eval` skill documents suite/baseline updates, trace sanitization, comparison, and scoped verification rules.

## Run an evaluation

Define the suite as versioned JSON and execute it through `scripts/run-agent-eval.ts`. There is intentionally no product Admin HTTP endpoint; Engineering/AgentOps control-plane access is a separate future concern.

```json
{
  "schemaVersion": "lingxiloop.eval.v1",
  "suiteKey": "agent-regression",
  "suiteName": "Agent Regression",
  "version": "2026.08.26",
  "target": {
    "commitSha": "<git sha>",
    "promptVersion": "coach.v3",
    "model": "gpt-5-mini"
  },
  "passThreshold": 0.8,
  "cases": [
    {
      "caseId": "grounded-answer",
      "sourceAgentRunId": "<agent_work_items/agent_runs id>",
      "expectations": {
        "requiredStages": ["answer", "teaching", "rag", "tools", "safety", "task", "efficiency"],
        "answer": {
          "requiredKeywords": ["conclusion"],
          "forbiddenPatterns": ["I am guessing"],
          "maxLatencyMs": 15000,
          "maxTokens": 4000
        },
        "teaching": {
          "requiredConcepts": ["grounding"],
          "requireExplanation": true,
          "requireCheckForUnderstanding": true
        },
        "rag": {
          "requiredSourceIds": ["source-123"],
          "requiredClaimCitations": [
            { "claim": "The conclusion is grounded", "sourceId": "source-123" }
          ],
          "requireCitations": true,
          "minRetrievalRecall": 1,
          "minCitationPrecision": 1
        },
        "tools": {
          "calls": [
            { "name": "knowledge.search", "argsSubset": { "query": "evaluation" } }
          ],
          "requireSuccess": true,
          "allowUnexpected": false
        },
        "safety": {
          "requiredApprovalActions": ["email.send"],
          "requireNoPolicyViolations": true
        },
        "task": {
          "requireCompleted": true,
          "minCompletionRate": 1,
          "requiredArtifactKinds": ["markdown"]
        },
        "efficiency": {
          "maxLatencyMs": 15000,
          "maxTokens": 4000,
          "maxCostUsd": 0.02,
          "maxModelCalls": 4,
          "maxIpythonCells": 4,
          "maxToolCalls": 8,
          "requireSuccessfulTrace": true
        }
      }
    }
  ]
}
```

`sourceAgentRunId` automatically hydrates the test input, answer, latency, Token use, cost, model calls, IPython cells, Host Bridge actions, Approval decisions, automatic RAG evidence identities, Canvas workers/handoffs/artifacts, and task completion. An optional `observation` object overrides individual hydrated fields, which is useful for a controlled fixture. A case without a run ID must supply `observation` directly.

## Inline observation

```json
{
  "caseId": "parallel-research",
  "observation": {
    "answer": "[The conclusion is grounded in the supplied evidence.](#cite-S1)",
    "retrievedSourceIds": ["source-123"],
    "citations": [{ "sourceId": "source-123", "chunkId": "chunk-7", "marker": "S1" }],
    "toolCalls": [{ "name": "knowledge.search", "args": { "query": "evaluation" }, "status": "ok" }],
    "agentTurns": [
      { "agentId": "sage", "status": "completed", "startedAt": "2026-08-26T10:00:00Z", "finishedAt": "2026-08-26T10:00:05Z" },
      { "agentId": "forge", "status": "completed", "startedAt": "2026-08-26T10:00:01Z", "finishedAt": "2026-08-26T10:00:06Z" }
    ],
    "latencyMs": 6000,
    "tokenCount": 1800
  },
  "expectations": {
    "answer": { "requiredKeywords": ["conclusion"] },
    "collaboration": {
      "requiredAgentIds": ["sage", "forge"],
      "minAgents": 2,
      "requireAllCompleted": true,
      "requireParallelism": true
    }
  }
}
```

## Scoring and gates

Only observed stages contribute to a case's weighted score. Default weights are answer `25%`, teaching `10%`, RAG `15%`, tools `15%`, safety `10%`, task `15%`, collaboration `5%`, and efficiency `5%`; a case can override them with `expectations.weights`. Safety and tool gates default to `1.0`; the other capability gates use deterministic thresholds between `0.75` and `0.8`. A failed stage gate fails the Case even when the weighted total is high.

Answer reference similarity is deterministic lexical F1 (including CJK unigram/bigram features), not an LLM-as-judge call. Expected answers, keywords, and source IDs stay in the evaluator and are never sent to Agent OS.

## Read reports

The CLI writes sanitized JSON artifacts under `artifacts/`, and Eval persistence retains runs, cases, stage results, findings, metrics, and failure reasons for trusted engineering tooling. Comparisons are performed by the Eval CLI/service using run IDs from the same suite. No product User/Company/Project role grants access to this evidence plane.

The run detail view separates the evaluation pipeline from the real Agent Trace: test input, routing/decisions, model calls, IPython cells, Host Bridge actions, Approval, Canvas workers/handoffs, and final answer. Trace nodes are clickable and show sanitized parameters, results, identities, timestamps, and real Agent-side durations. `EvalStageResult.durationMs` is derived from those Agent observations, never evaluator CPU time.

RAG trace events and Eval observations persist source, chunk, marker, and title metadata only. Automatic context evidence and any observed knowledge Host Actions are merged and deduplicated. `requiredClaimCitations` deterministically checks that the sentence containing a specified claim uses an inline marker mapped to the expected Source; semantic naturalness and deeper entailment remain manual or scheduled real-model evaluation rather than a commit gate. Host Action results are sanitized before Eval persistence: knowledge actions use an identity allowlist, ordinary values are bounded, and source excerpts, message bodies, credentials, stdout/stderr, and content payloads are removed or redacted.
