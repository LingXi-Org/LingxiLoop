# Formal 3.8.24 product qualification

Registry metadata reports version3.8.24 and gitHead
`9e5742a32bc113b5b1eb71100edebb4ad4af5dc3` (LingxiOS PR #87).
The installed archive is:

```
https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.24/07443a3068e7b144e1a85974493ad543c883f76b
sha512-Dq6OQxYHxtbHBsUvCHOodlpzmappQ+6bXc99YcWY65kJJkrskr2axRVwYDysLuLCSnrJ22CBE/RiLydNy002wQ==
```

Downloaded bytes match that integrity. Root/server and generated scoped locks
all use this formal receipt; the executing package is the extracted registry
archive. Native SQL remains SHA256
`c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f`
with schema14/protocol11/publicText3. Ordinary exact formal startup checks remain
active; no source-candidate adapter is used.

## Closed failure attribution

Public contract:
<https://github.com/LingXi-Org/LingxiOS/blob/v3.8.24/docs/contracts/output-callback-failure-origin.md>.
`ModelFailure.kind` can supply `output`; `outputCallback` can supply `operation`
or `delta`. Origin is independent of category/retry eligibility. Existing
publication/source validation and bounded correction/recovery remain unchanged.

The existing shared ledger receives these closed SDK fields without changing
fees, token usage or call-id idempotency. Authorized run readers select only the
two attribution fields, validate them and omit invalid/missing/success-row
attribution. The admin stage card labels provided local output/callback origin;
legacy missing data stays unprovided, never an inferred supplier diagnosis.
No raw messages, errors, stacks, tool arguments or credentials are projected.

The actual formal24 Worker/PG synthetic invalid-replacement case still fails
safely in one model call, with no publication/ACK and no sealed result. It now
reports output/operation rather than the older provider/unknown wrapper. This
proves the attribution fix for that synthetic case. It does not establish the
cause of the historical formal23 live stream failure.

## Reviewed version handoff

The default product61 plan is a single exact21→24 provenance CAS, without
starting an intermediate22 or23 Worker. Confirmed22→24 and23→24 plans are explicit
alternatives, each with its own plan/intent ID. No source fallback is attempted.
Old21/22→23 pairs remain reviewed. Other sources, partial product history,
registry mismatches, DDL/adoption and unknown outcomes stay rejected.

Lease/heartbeat/retained-work, maintenance/drain, exclusive-client and uncertain
COMMIT observation gates remain intact. The local fresh bootstrap records an
actual formal21/product61→24 update of one provenance row, followed by read-only
startup. Actual formal21/22/23 archives separately preserve their owning cases;
the new target24 matrix covers21,22,23 sources with all five safety cases each.
The production single-writer and host-state gates still require the designated
sole integrator before any merge/rollout.

## Product validation

Local deterministic checks:29 deployment/owner/bootstrap contracts;60 cases
across11 owning integration files; server184/184; admin11/11; focused projection
and SSR14/14; server/admin/web types, owning lint and admin build. Existing lint
informational notices and bundle-size warning remain. Final CI and independent
candidate review are recorded in the PR.

Final review caught a TypeScript widening error in the attribution projection.
The projection now explicitly uses the shared closed attribution type; service
typecheck, service lint and the five owning projection cases passed after that
correction. Earlier failed typecheck logs do not count as successful checks.

The original full-product brief fixture was run with the formal registry package,
real provider, local recording IM and an isolated test database. Each root was
bounded to3 model calls and its existing test-only token/cost/time admission
limits. Three roots passed all existing acceptance/delivery checks. Actual model
calls were2,1,1 (four total); no matched replay controls or extra requests were
added. Call count alone is not evidence that a particular attempt was a protocol
correction. Raw response/argument/credential payloads remain private.

This is a bounded functional regression, not a production latency/capacity SLA,
quality guarantee or a reconstruction of the earlier live failure. #653 queue
budgets, shared supplier quota and production configuration/health acceptance
remain separate work. No production merge, provenance/configuration write or
deployment was performed by this qualification.
