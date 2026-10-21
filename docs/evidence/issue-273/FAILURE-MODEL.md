# Saved visualization without delivery: failure model

Recorded before implementation, 2026-10-21. Scope: public source and synthetic
fixtures only. No private production conversation, HTML or diagnostics were read.

## Distinct causes to check

- A successful save is storage evidence, not an answer or a quality check.
- `visualize.save` currently returns a path but no literal display reference;
  unlike the deterministic authoring tools, it makes the model reconstruct it.
- Missing-reference verification always says to save and read again, even after
  the current artifact was already revised and read. Its repair evidence omits
  the authorized current-request candidates. A repair can therefore repeat
  writes instead of resolving only the missing reference.
- Multiple revisions must not cause an old hash/version to be suggested. Neither
  a storage hash nor a suggested reference proves semantic/browser correctness.
- A different tenant, conversation, principal, agent, request or revoked audience
  must never receive repair candidates. A corrupt document must not be suggested.
- A candidate hint is not delivery: only an explicit final reference passing the
  existing native/product checks may resolve authoring. Cancellation, revocation,
  invalid references and hard root-budget exhaustion remain effective.
- Runtime 3.6.0 has no fixed maxTurns. Root calls/tokens/cost/time and consecutive
  correction budgets are separate. A hard limit can prevent a final generation;
  this does not prove the reported incident reached that limit. The quoted UI
  status also appears while a run is still leased.

## Minimal verification planned before code

1. Real PostgreSQL/public Worker: save/read, revise/read twice, return a candidate
   missing its reference, then use the current authorized repair evidence to
   deliver the final reference within the original correction/root budgets.
   Assert exactly three saves, latest bytes/hash/version, one repair, durable IM
   delivery and no old or foreign reference. No full skill pagination is needed
   in this fixture; #272 owns that independently.
2. Owning authorization/checker integration: absent/foreign/old-request/corrupt
   candidates are excluded, revocation does not reveal candidates, and known
   content errors never become automatically delivered references.
3. Explicit small call limit: successful save/read followed by refused final
   generation remains non-delivered. Do not add retries or increase limits.
4. Run the affected existing delivery/projection checks and server typecheck/lint.
   Local synthetic provider results do not establish production provider latency
   or the original private case's unique root cause.

If source or reproduction instead requires native finalization admission, change
the upstream public API and exact published version; do not parse private native
tables, append a saved path automatically, or bypass unresolved obligations.
