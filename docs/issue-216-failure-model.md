# Issue 216: failure model and cross-repository contract

Baseline: LingxiOS e44fb862 (3.5.6), Loop b7b165fd (production image 2ea8615c).
Both phases are one delivery. This document records the failure model before implementation.

## Proposed additive public API (release coordination required)

- Explicit trusted scope grants distinguish principal, principal-course, shared-course, Agent and legacy conversation partitioning. Existing consumers retain their old partitioning unless opting in. Current audience and product authorization remain mandatory on every operation.
- A bounded, inspectable legacy-scope migration API moves proven personal records without cloning their identity; provenance/version mappings are retained and forgetting cannot recreate moved/deleted facts.
- Separate context allocation for core, directory, related memory and strategies, plus sanitized omission/index diagnostics.
- Embedding configuration gains explicit index version; model, endpoint, dimensions and version identify a vector space.
- Synthesis pages committed source material using persistent cursors, bounded per-run processing and continuation jobs. Epoch, request version, source hash and lease/fence fence each page.

Expected release: a compatible minor 3.6.0 candidate, subject to the sole integrator's coordination with issues 215/218. This branch does not bump or publish a version. Loop must ultimately pin the integrator's formally published exact version and lockfile; source qualification alone is not release acceptance.

## Failures to cover

1. New rooms/threads/Agents create another personal identity; policy-version changes fork profiles.
2. Other users/tenants, multi-human rooms, teacher intervention, unapproved Agents or revoked recipients receive a personal profile. Cache or tool replay bypasses reauthorization.
3. conversationId masquerades as a real course; course-personal facts enter shared-course memory.
4. Legacy migration guesses ownership, promotes group content, loses provenance, duplicates data, races with correction/deletion, or revives expired/revoked/forgotten records.
5. Explicit save reports success before a transactional receipt. New conversation cannot read the commit while indexing is pending.
6. Synthesis sees only a prefix, drops middle/tail/revisions, marks partial processing complete, or cannot resume after process loss. Repeated pages duplicate facts.
7. Old synthesis/migration/index jobs outlive an epoch or source revision; historical retained messages recreate forgotten memory.
8. Background inference rewrites explicit/locked facts or assistant help is mistaken for learner mastery.
9. Semantic recall remains disabled, uses stale document versions, mixes model/dimension/index versions, or labels keyword fallback as semantic success.
10. Embedding outage or exhausted cost/concurrency budget blocks direct facts/ordinary turns or creates an unlimited retry chain. Cancellation must terminate pending provider calls.
11. Directory consumes the entire context allocation; oversized core silently disappears; core lock status is mistaken for injection evidence.
12. Scope widening adds unbounded foreground scans or discards previous latency gains, conversation/canvas compatibility, durable queues or leases.

## Required evidence

Run the existing focused memory/embedding suite under the same Node and database conditions before and after. Add behavior-level cross-conversation, migration, long-source and budget cases before implementation. Use isolated PostgreSQL product integration and the existing official tester-army/e2e browser engine. Real provider evidence must use the already authorized endpoint/model/key, show current vector-space identity and actual injection/recall, and be labelled separately from deterministic fixtures. Store only synthetic IDs, counts, timings, statuses and costs, never credentials or raw memory/prompt text. Migration is applied twice; its second application must be a no-op. Record every unexecuted acceptance item explicitly.
