# Issues 196 / 197: model availability and latency

Written before implementation. This document contains only public driver
contracts and synthetic test plans. Operational diagnostics remain outside the
repository. No messages, memory bodies, prompts, credentials or provider error
bodies are written into artifacts.

## Hypotheses and regression requirements

1. GLM-5.3-Flash's official model card documents `low/high/max`, default `max`.
   Published runtime 3.5.3 only accepts high/max. Acceptance and effects of low
   must be measured at the intended provider, not inferred from another API.
   Keep `maxThinkingTokens: 0` explicit.
2. Nonstreaming structured/compaction calls may not deliver body bytes until
   generation finishes. The first-byte timer can therefore cancel a healthy
   generation within the total request budget. Test with real HTTP slow-body
   fixtures before choosing streaming or another bounded policy.
3. Reasoning deltas must never become user text. Streamed JSON must validate
   final reason, JSON shape, truncation, byte limits, cancellation, idle and
   total timeouts. Usage and every attempted call must remain in the ledger.
4. Shared circuit protection must remain bounded; a successful repair must
   not replay completed tools, bypass root budgets, or hide partial/failed
   state. After recovery, a new human turn must be able to succeed.
5. Explicit effort must reach ordinary, structured and compaction requests,
   including the single-attempt clones used by workers. Existing defaults
   and compaction policy must remain compatible for other models.
6. No runtime source is vendored or adapted in the product. New options
   require an upstream PR and an exact published dependency before release.

## Initial latency budget

The isolated memory baseline separates current authorization, pool acquisition,
memory SQL, benchmark registration, native tool event persistence, model wait
and presentation. With 0/8/1024 synthetic documents, list medians were about
12.4–15.3 ms and tool start-to-completion 42–84 ms. Budgets are regression targets,
not production percentiles: memory list <250 ms and completed event projection
<250 ms under an unrelated held lock; cancellation/terminal visibility <1 s
once authoritative state exists. Provider first content and completion must be
reported separately; no provider SLO is claimed from a handful of probes.

The urgent 197 fix precedes optional 196 performance changes. No schema change,
production fault injection, deployment or soak mutation is part of this branch.

Reference: https://huggingface.co/zai-org/GLM-5.3-Flash
