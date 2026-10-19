# Streaming protocol performance — issue #202

Base: `088e269f36f63884b44704c3b0f1e27f1a6f76fc`. This is a new experiment; existing `perf/bench` ceilings and prior reports remain unchanged.

The server public run projection and Assistant Transport encoder are the initial scope. Investigate repeated full-tree serialization and duplicated snapshots. No provider, timeout, model, authorization, database, shared cache, deployment, AGENTS.md or CI changes. Only the integration owner deploys. Seek ≥3x **measured scoped** improvement without promising system/model speedup.

Use synthetic data only. First response = first decoded protocol state; first body = first decoded nonempty answer; total = decoded complete stream. These server metrics are NOT browser visibility or provider TTFT. Browser evidence separately observes rendered answer. Report CPU user/system, peak sampled heap/RSS, JSON calls/serialized characters, wire bytes/chunks and HTTP/SQL calls (zero in isolated in-process protocol bench; not a production claim). At least ten A/B pairs on the same host, nearest-rank p50/p75/p95. Timing is diagnostic; deterministic equality/counts are guards. No long soak.

## Failure model (written before implementation)

- Omitting normalization changes undefined object keys/array slots, nonfinite numbers, JSON property order or escaping.
- Recursive comparison misses deleted keys, changed object/array type or array length, or emits incorrect paths for numeric and Unicode keys.
- Append operation is used for retractions, replaced strings, or fields other than text/argsText.
- In-place mutation corrupts the previous snapshot, changes prior operations, or shares state across requests/users.
- No-op/duplicate frames generate redundant wire operations; stale fences promote rejected text; reset/cancel/failure loses state.
- Avoiding duplicate projection skips public filtering, validation, approval/terminal/questionnaire refresh, gap detection or event ordering.
- Replay skips malformed intermediate messages that previously failed validation. Do not optimize replay by skipping validation without separate evidence and safeguards.
- Benchmark fixture favors only long text, counts its own instrumentation or decoder as server-only work, reuses warm process unfairly, or mislabels synthetic response timing as real model or browser performance.

Existing protocol tests and new round-trip cases must pass on baseline before code changes. Follow existing server suite and owning integration; browser uses only official @e2e-dev/web. Store raw samples, exact revisions and commands. Rollback is reverting this isolated code commit; no migration/config restoration required.

## Supplemental source-control article

Read [Redesigning source control at Anthropic](https://www.anthropic.com/engineering/redesigning-source-control), published 2026-10-13, updated 2026-10-15. Applicable principle: avoid work proportional to the whole state when only a small delta changes, and avoid eagerly materializing unused derived output. Here this maps to structural diff and one validated snapshot per emitted event. This is our inference across domains, not a claim that Scion solves chat latency. Use ordinary Git worktrees and share installed immutable dependencies locally; no new VCS, remote cache, IAM change or monorepo infrastructure. CI resource changes belong to the other task.

## Third experiment: parser fast path, before code

A measured candidate CPU profile attributes ~24% of sampled self time to visualization directive prefix/code-range scanners on ordinary long text. Hypothesis: skip the parser only when neither ASCII `:` nor Unicode `` exists. Failure cases: partially streamed bare prefixes, incomplete JSON, invalid/complete directives, escaped text, fenced/inline/HTML code ranges, supplementary Unicode, and mistakenly changing committed text. Test exact equivalence to the pinned upstream parser across these cases before editing the local server wrapper. Never modify the pinned upstream parser, schema, validation or completed-message semantics.
