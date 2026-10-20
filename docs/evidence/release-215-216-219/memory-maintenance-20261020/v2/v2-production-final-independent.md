# Issue216 production maintenance: final independent evidence review

**PASS — 45/45 local evidence checks.** The authorized old-scope migration and
necessary index-maintenance gap is resolved for the scopes currently authorized
by the public product/runtime APIs. The result explicitly does not claim global
coverage.

Machine report: `v2-production-final-independent.json`. This reviewer inspected
the production receipts already collected by the sole production executor; no
production API, SQL, provider or service request was made by this reviewer.

## Exact successful native operations

| Mode | Native update | Native duration | API calls |
| --- | --- | ---: | ---: |
| inspect | `6ad7908be06d5e1f798373a2` | 27.751 s | 147 |
| execute | `6ad790f0e06d5e1f798373b5` | 46.292 s | 225 |
| status | `6ad79172e06d5e1f798373d1` | 11.084 s | 106 |

All three are exact `RunStackService` receipts for the existing app-A Stack,
`Complete`, `success:true`, with a fresh terminal readback. Each operation emitted
the three exact control → business-Redis → database cleanup pairs before its
unique final `cleanupComplete:true` marker.

All three use frozen remote script
`d7eeed3847179f28538625e1a5bd19df295ed33f4a85692cfd87e471afae9c34`.
The exact output schema validated every recorded event. The raw receipt hashes
are bound in the machine report.

## Migration and provenance accounting

Inspect rediscovered and authorized 25 existing identities, scanned all 25 and
observed all 25 original continuity candidates. Five unique documents were
eligible; 20 continuity documents and 15 agent-role documents remained excluded
from continuity migration.

Execute repeated current authorization and initial eligibility checks before
mutation. Its budget gate passed with 91 calls used, 398 conservatively reserved
and 421 remaining. Eleven confirmed migration-page receipts cumulatively report
**5 unique migrated documents: 3 learner and 2 course**.

The same original 25-record cohort then contained **5 stable / 20 legacy /
0 deleted / 0 moved to an unexpected scope**. These independent cohort counts
agree with the public API's deduplicated migration receipts.

The full post-migration dry-run observed 35 remaining legacy documents, all
isolated with no remaining eligible result: 10 learner, 10 course and 15
agent-role. The mutating phase's 27 inspected / 22 isolated counts describe only
the selected eligible identities' visited subset; they must not be substituted
for the full post-scan's 35.

Reason counts exclude documents eligible or migrated through another identity.
Different reason categories may still overlap for an isolated document, so their
sum is not a partition. No missing ownership/audience proof was bypassed.

## Index queue and completed index coverage are separately proven

Execute confirmed **20 queued documents across 11 authorized scopes**. Its final
doctor still reported 20 eligible, 0 indexed, 20 missing; the execute receipt did
not claim that queueing meant completion.

The later independent status operation performed no migration, no dry-run
migration and no reindex. It resolved current authorization again and reported:

- 31 authorized scopes, all 31 configured.
- **20 eligible / 20 indexed / 0 missing**.
- `indexingCompleteForAuthorizedScopes:true`.
- `globalCoverageClaimed:false`.

The frozen public semantic status query counts embeddings matching the current
memory version and active driver cache key. This supports completion of the
currently authorized index work, not a claim that every historical memory is
accessible or globally indexed.

The 15 agent-role records were not continuity-migration candidates. That does
not prohibit indexing them when their existing scopes are independently
authorized. The 20 residual continuity records remain isolated; no identity,
grant, ownership, scope or fence was invented to force them into the result.

## Deployment and historical failure preserved

Every successful operation has matching before/after accepted-target guards.
The same four accepted container IDs, audited image IDs, three full-config
hashes and three Compose hashes persist across inspect, execute and status.
Original container health/policy checks remained successful.

The earlier failed inspect `6ad78db1e06d5e1f7983730e` remains recorded as
Complete/success:false after 180.739 s. Its prematurely emitted application
marker was not converted into native success or used to authorize execute.
The new namespace preserves that history.

The concrete maintenance lifecycle omission was fixed and the new processes
completed naturally after cleanup. This is not a controlled memory-recall
latency benchmark, nor evidence that CLI cleanup caused the original
conversation “view memory” latency. A separate public CLI cleanup PR should
retain that distinction.

## Final disposition

The old-scope migration and required authorized indexing operations can be
closed as completed, with the residual isolation classifications retained.
There is no unresolved native operation or index-completion blocker in the
reviewed sequence. The result remains limited to observed authorized scopes,
the recorded time window and the preserved deployment; it does not claim a
global authorization expansion or a new exhaustive provider/isolation test.
