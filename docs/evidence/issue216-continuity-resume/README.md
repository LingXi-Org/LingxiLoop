# Issue216 resumed product qualification

This fixture follows the product's public LingxiOS worker and memory API, actual
provider/embedding configuration and shared budget ledger. It records only fixed
phase/operation names, timings, wait categories and boolean sentinel matches.
It never replaces provider responses or writes prompt/memory bodies to evidence.
The original failure database and all resumed candidate databases are distinct.

The baseline on native `6a022d52` again stopped at 5/7 segments. Diagnostics show
four protected-document proposal failures and one protected-document repair
failure, plus a duplicate create path. It ended at the existing 240-second
extraction bound (280.9 seconds for the full test), not the old 207-second Abort.
There were 37 provider-ledger calls and 349,264 costMicros. No public operation
threw before the fixture assertion; sampled database waits had zero blockers.
The original Abort's owner remains unproven; it was not reproduced here.

Native `e56102bf` separates editable records from protected read-only context
while retaining the original snapshot's authoritative validation and independent
review. Its complete product flow passed in 168.2 seconds: 43 measured calls,
497,473 costMicros, 9 embedding calls, one 1024-dimensional vector space. It
verified explicit long-input facts, immediate new-room core input, active hybrid
recall, automatic middle/tail extraction, effective revision, new-room answer,
and post-forget removal of search/vector entries. An initial apply rolled back and recovered through the existing durable retry.
No test deadline was increased. The ledger, inspected later, identifies an
optional strategy candidate on an incomplete page; event timing alone did not
establish a malformed review.

Native `e1e1aa9bca2040d46cd732a50051bb660d16a7ee` then passed the full flow
in 181.9 seconds (186.3 including harness), 38 measured calls, 345,393 costMicros
and 10 embedding calls. It also asserts that automatic middle/tail facts are
both in the FIRST provider input of the new room. Its retained ledger shows an
approved `memory_synthesis.apply` with one candidate, no fact changes and
`transaction_rolled_back`; recovery succeeded on the existing retry.
`review-candidate-apply-failure.json` is the content-free receipt projection.

The bounded review-shape correction has an independent synthetic red/green
test. It is not claimed as the proven cause of the real apply rollback. Native reviews still need approved+complete and confidence;
one malformed verdict may consume the existing single page repair allowance.
A negative or second malformed verdict cannot authorize writing. No change to
scope, epochs, version checks, leases, retry count, schemas or public memory API.

## Final scoped-source candidate

Native implementation `2738508c90386d94c512d08519855bfc51c15674`, Loop
fixture `0bf981dc5d5df6958b786d3252ebe22e8dbbc882`, locally packed native
3.5.8 source (not published): full real-provider flow PASSED in 86.658 seconds,
89.289 seconds including harness. All 37 calls are measured, including 10 real
bge-m3 embedding requests; total across separate bounded work roots is 400,008
costMicros. Maximum one-root cost is 141,632, below its unchanged 400,000 limit.
All seven synthesis jobs succeeded on attempt one; no validation failures or
failed apply receipts remain. Three initial vectors share one current-version
1024-dimensional space. All nine named checks pass, including the first
new-room provider input containing both automatically extracted facts.

The native load only offers optional strategy candidates at a complete source
boundary with an accepted prefix in the current scope. Proposal and evaluation
require current scoped completion, source version and epoch; another authorized
scope can remain pending without blocking this one. Incomplete/rejected sources
remain ineligible. Legacy complete unsegmented evidence remains compatible.
Candidates are still inactive until independent frozen evaluation passes.
Native focused regression passes 37/37; no schema or new public API is needed.

`scoped-live.json`, `scoped-operations.json`, `scoped-state.json`,
`scoped-budgets.json` and the empty `scoped-failed-apply.json` retain the final
result. Operation diagnostics contain zero errors; transient Lock/IO samples
are retained, not removed. `scoped-package-proof.json` verifies all 459 packed
compiled files against the built source candidate and records its tar digest.
The first scoped fixture attempt failed its second database-name allowlist before
provider calls; `scoped-fixture-allowlist.tap` is retained. Only the new explicit
test database name was added. No wildcard or production database is accepted.

These bounded runs use the same configured budgets and providers; they are
functional evidence, not a statistically established latency improvement.
The historical 207-second Abort still has no proven owner. Its evidence and
original test database are preserved; it was not reproduced in resumed runs.

## Reproduction

Use the saved cloud environment and already-authorized provider route. Run in
this Loop checkout with its exact native source package installed locally:

```sh
source /workspace/.lingxi-production/env.sh
npm run server:typecheck
MEMORY_LATENCY_LABEL=candidate node e2e/server/memory-regression.mjs native-memory.test.ts memory-continuity.test.ts memory-latency.test.ts
MEMORY_CONTINUITY_QUALIFICATION=scoped OPENAI_EMBEDDING_MODEL=BAAI/bge-m3 EVAL_CANDIDATE_MODEL=zai-org/GLM-5.2 EVAL_CANDIDATE_INPUT_CNY_PER_MILLION=8 EVAL_CANDIDATE_OUTPUT_CNY_PER_MILLION=28 lingxi-prod model-run node e2e/server/memory-regression.mjs --live-continuity
```

Qualification targets are a strict allowlist of isolated test databases. `1`
preserves the baseline run, `candidate` the first successful candidate, and
`final` the review candidate, and `scoped` the final source-completion fix. The runner applies migrations and reruns them
as a no-op; it does not alter production configuration. It deliberately retains
600-second overall / 240-second extraction / per-root budget bounds.

Final candidate product owning integration passes **4/4** in 49.314 seconds
(native activity/durable delivery, authorized room/Agent continuity, repeated
compaction/restart and latency guards); `server:typecheck` passes.
`final-owning.tap`, `final-typecheck.txt` and `final-latency.json` retain them.

Formal package publication, exact release pin/lockfile, integrated CI, production
drain and migration/backfill remain the sole integrator's responsibility. Loop
migration0047 / native015 / schema13 are unchanged by this follow-up. This is a
backend/qualification change; no new browser result is claimed. Existing UI
checks remain in the related original issue216 PRs. No merge, production deploy
or issue closure was performed here.
