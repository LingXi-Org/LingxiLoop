# Runtime failure and public-answer residual qualification

Scope: #439, #515, #518, #560, #579, #582 and #616. Base main is
`8cc00fd8` (2026-11-04). The user's current authorization permits development,
merge and production delivery without waiting for additional incident evidence.
This contributor hands a draft to the designated sole integrator,
task `01a19a90-dfc4-77f7-9803-e9035c481026`; no merge or deployment was performed.

## Current implementation inventory

Issue bodies and all comments were read before development. Open PRs #635,
#657 and #672 were checked. #635 owns teaching context; #672 is actively retiring
Visualize in favor of Design. This change touches neither product path.

| Issue | Existing implementation retained | This qualification and its limit |
| --- | --- | --- |
| #439 | #457 context diagnostics and subsequent learning-record/report/submission behavior | Current homework suite passes 54 cases, including genuine learning records, report and submission authorization. This is not the original invitation-to-browser journey or a reconstruction of its supplier failure. |
| #515 / #518 | #564 draft/locale projection, #587/#592 failed-candidate lineage, #609 sealing, formal24 in #659 | Native-v1/v2/v3 complete/correction/finalization/exhaustion pass 12 cases, plus 3 provider recovery cases. New native-v3 cases verify missing-call correction, preserved sealed body and bounded exhaustion through Worker/ledger/IM/authenticated replay. No historical TTFT or supplier-failure rate is inferred. |
| #560 | Existing incomplete-artifact safeguards and formal runtime fixes | All 8 existing activation/save/authorized-readback/delivery and budget-limit cases pass. No browser rendering or live generated attention artwork is claimed. |
| #579 | #587 lineage and #607 actual retrieval receipts/range guidance | New no-native-call exhaustion remains failed, records all 3 calls and exposes the exact safe protocol code. Current knowledge activity checks and frozen page-specific citation delivery/reconnect pass. On-demand retrieval remains the current product policy; no synthetic activity or real course retrieval is claimed. |
| #582 | #587 formal18 exact-source selectors and specific invalid-input diagnostics, retained by formal24 | Published source inspection confirms whole-source/UTF-16 selection and invalid/not-found/ambiguous causes. Existing activation/delivery cases pass. This run does not replay the original multiline request or certify its generated diagram. |
| #616 | #617 shared public-answer guidance, title citations and source-card cleanup | Guidance/knowledge/progress checks, actual product frozen-citation delivery/reconnect and 26 focused frontend cases pass. Existing real-provider evidence in `docs/evidence/issue-616/` is retained; no new provider request or arbitrary-output secrecy guarantee is claimed. |

The retained PRs are #457/#564/#571/#587/#592/#607/#609/#617. Current formal24
already contains native-v3 `tool_choice: required` and the public timing boundary
associated with LingxiOS #83/#84. Those upstream issues remain open; open status
does not establish that their implementations are absent. LingxiOS #88's original
T13/T16/T17 journeys and performance comparisons remain unqualified here.

Read-only repository metadata confirmed `leecyang` has push/admin access to
LingxiOS. No upstream source, branch, release, credential or setting was changed.
The installed runtime is the **published registry archive**, not slim main or a
locally built candidate:

```
@lyyzka/lingxios 3.8.24
gitHead 9e5742a32bc113b5b1eb71100edebb4ad4af5dc3
sha512-Dq6OQxYHxtbHBsUvCHOodlpzmappQ+6bXc99YcWY65kJJkrskr2axRVwYDysLuLCSnrJ22CBE/RiLydNy002wQ==
```

## Changes

`runtime-native-correction.test.ts` uses the real published Worker, isolated
PostgreSQL, shared ledger, recording IM and authenticated product reader with a
local deterministic HTTP provider. Each request and correction must use
`tool_choice: required`; a deliberately noncompliant plain-text response is still
rejected. Correction instructions identify the native call. Scenarios cover:

- Missing first call: one generation failure plus one successful correction,
  with one delivered body and unchanged recorded token usage for the failure.
- Sealed answer then a missing native call: the sealed body remains visible
  during correction; a null terminal answer reuses it instead of regenerating it.
- Three consecutive missing calls: bounded failure, no accepted result or
  assistant delivery, all three ledger entries and
  `public_text_answer_required/native_call_missing` diagnostics retained.

All three cases compare authenticated restored message content with the direct
projection, reject another company and prove ingress replay issues no new call.
Unbound provider text and the synthetic API key do not enter those public/audit
projections. These are synthetic controls, not a general redaction guarantee.

The existing recovery fixture used `public-answer-${scenario}.json` for all three
bindings. An explicit shared evidence directory reproduced six `EEXIST` failures
despite the behavior assertions succeeding. Filenames and JSON now include the
binding, preserving each distinct result without overwriting it. No product
protocol, permission, runtime dependency or schema was changed.

## Executed checks

Cloud Linux, Node22.22.0, dedicated loopback PostgreSQL16/Redis7. The guarded
test bootstrap used actual formal19/20/21 archives, then formal21-to24 provenance
CAS, the additive case-options migration and a verified second no-op. These are
test-database operations, not production installation or adoption.

The unchanged configured package helper downloaded formal24; its SHA512 matches
the committed lock. Remaining dependencies are linked from the existing local
installation. A clean full-lock install and exact-head CI remain the integrator's
qualification boundary.

```
RUNTIME_ACCEPTANCE_OUTPUT_DIR=<new-empty-directory> \
  node server/run-integration-tests.mjs \
    --file runtime-native-correction.test.ts \
    --file runtime-chat-recovery.test.ts \
    --file runtime-issue560-delivery.test.ts \
    --file confidence-citations.test.ts \
    --file homework.test.ts
```

Use a dedicated `INTEGRATION_DATABASE_URL`/`DATABASE_URL`, explicit local Redis,
test mode and synthetic non-provider credentials, as required by the existing
runner/bootstrap. Never target production. The fixture output directory must be
new for a repeat run; exclusive writes deliberately retain prior evidence.

Results: **81/81 integration cases**, zero failed/skipped, 132.6s. File counts are
3/15/8/1/54. `integration-timings.json` and the three `native-v3-*.json` records
contain the actual bounded run results without private identifiers or prompts.

- Server smoke plus selected public-answer/knowledge/workflow tests: **190/190**.
- Focused source-card, harness and activity-history frontend tests: **26/26**.
- `npm run server:typecheck`, affected Biome lint and `git diff --check`: passed.

Earlier attempts are not counted as passes: the first local integration start
omitted the synthetic invite base URL; the initial evidence export reproduced
the filename collision; an intermediate local retry reused three pre-existing
provider-recovery evidence files; the first new-test typecheck caught a widened
`executionClass` literal. Environment setup, binding filenames and the literal
type were corrected before the successful run. No assertion was removed or
threshold weakened.

## Delivery boundary

This is a test/evidence residual change over already merged product fixes.
Additional private evidence is not a merge gate under the user's current
instruction. Historical incidents, real provider rate/latency, browser journeys,
the exact #582 multiline diagram and the T13/T16/T17 suite are not represented
as passed. No original issue is closed solely because synthetic tests pass.

The sole integrator owns independent final-candidate review, final CI/conflicts,
alignment with #672's retired Visualize fixtures, serial merge and production
deployment/probes. Production completion requires the successful deploy result;
a draft, merge or queued workflow is not that evidence.
