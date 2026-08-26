# Agent Eval

LingxiLoop Agent Eval is an admin-only, deterministic regression system for four product capabilities:

1. Agent answer quality;
2. RAG retrieval and citation traceability;
3. tool selection, arguments, order, and execution result;
4. multi-Agent participation, handoffs, completion, and parallelism.

Each case flows through `ingest → answer → RAG → tools → collaboration → aggregate`. A missing optional stage is reported as `skipped`; a stage named in `requiredStages` fails when it has no observable evidence. Reports are immutable and grouped by `suiteKey`, which makes scores comparable across `version` values.

## Run an evaluation

Admins can paste the same payload into **Admin → Agent Eval → 运行评测**, or call the API:

```http
POST /api/admin/eval/runs
Authorization: Bearer <admin session token>
Content-Type: application/json
```

```json
{
  "schemaVersion": "lingxiloop.eval.v1",
  "suiteKey": "agent-regression",
  "suiteName": "Agent Regression",
  "version": "2026.08.26",
  "passThreshold": 0.8,
  "cases": [
    {
      "caseId": "grounded-answer",
      "sourceAgentRunId": "<agent_work_items/agent_runs id>",
      "expectations": {
        "requiredStages": ["answer", "rag", "tools"],
        "answer": {
          "requiredKeywords": ["conclusion"],
          "forbiddenPatterns": ["I am guessing"],
          "maxLatencyMs": 15000,
          "maxTokens": 4000
        },
        "rag": {
          "requiredSourceIds": ["source-123"],
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
        }
      }
    }
  ]
}
```

`sourceAgentRunId` automatically hydrates the answer, latency, token use, Host Bridge actions, legacy tool calls, RAG evidence identities, and Canvas collaboration assignments. An optional `observation` object overrides individual hydrated fields, which is useful for a controlled fixture. A case without a run ID must supply `observation` directly.

## Inline observation

```json
{
  "caseId": "parallel-research",
  "observation": {
    "answer": "The conclusion is grounded in the supplied evidence. [S1]",
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

Only observed stages contribute to a case's weighted score. Default weights are answer `35%`, RAG `25%`, tools `20%`, and collaboration `20%`; a case can override them with `expectations.weights`. Stage gates default to answer `0.75`, RAG `0.75`, tools `1.0`, and collaboration `0.8`. A failed stage gate fails the case even when the weighted total is high.

Answer reference similarity is deterministic lexical F1 (including CJK unigram/bigram features), not an LLM-as-judge call. Expected answers, keywords, and source IDs stay in the evaluator and are never sent to Agent OS.

## Read reports

- `GET /api/admin/eval/runs?sinceDays=90&suiteKey=agent-regression` returns dashboard KPIs, recent runs, stage averages, previous-version scores, and deltas.
- `GET /api/admin/eval/runs/:id` returns cases, stage results, findings, metrics, and failure reasons.

RAG trace events persist source, chunk, marker, and title metadata only. They deliberately exclude retrieved excerpts so the observability ledger does not duplicate source content.
