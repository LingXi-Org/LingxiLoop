# Issues 155 / 157: current-version basic acceptance

2026-10-20 UTC. Under the user's revised acceptance scope, **both issues have the
required basic implementation and can be closed by the sole integrator** after
reviewing/integrating this evidence. No product runtime defect was found in this
bounded check. This branch changes tests and evidence capture only; it does not
merge, deploy, close issues, change credentials/quotas or operate the fixed 3.5.3 soak.

## Version and production boundary

- Product base: `e7422872a8314823794875c81b14f9393a08e15f`; deployed source observed:
  `7bdb7db9a7fb52ad304ea7d653742abc77e0e7e5`.
- Root and server locks pin published `@lyyzka/lingxios@3.5.5` with matching integrity.
  Registry gitHead is `a02e7aab414364f716ff91d6fd0821b42dddabdd`.
  [Provenance](provenance.json) compares nine compiled runtime files used by these
  tests byte for byte with that source build; [registry receipt](registry.json).
- [Read-only production summary](production-readonly.json) completed at
  2026-10-20T00:15:01Z: two consistent observations of four healthy application
  services, expected source/runtime 3.5.5/schema12, and passing public metadata,
  dependency and readiness checks. No administrative action was in progress.
  The public summary excludes administrative inventory and actual container
  identifiers. It does not independently resolve a registry image-index digest.
  Local fresh product migration 1–46 passed. **Production migration46 was not
  independently re-read through SQL in this subtask**; live installed schema12
  was read through product metadata. Sole integrator owns final SQL/rollout receipt.

## Issue 155

Existing implementation is in upstream
[`model/recovery.ts`](https://github.com/LingXi-Org/LingxiOS/blob/a02e7aab414364f716ff91d6fd0821b42dddabdd/src/model/recovery.ts),
[`model/execution.ts`](https://github.com/LingXi-Org/LingxiOS/blob/a02e7aab414364f716ff91d6fd0821b42dddabdd/src/model/execution.ts),
`model/openai.ts`, `model/embeddings.ts`, `memory/semantic.ts`, and product
`server/src/agent-runtime/runtime.ts`, `delivery.ts`, `context.ts`, `server/src/llm.ts`.
It classifies failures, bounds attempts/deadlines, propagates cancellation, accounts
attempts, checks approved fallback pricing/capabilities/current authorization,
and isolates embedding failures/vector spaces. Product production configuration
has no newly enabled fallback route; unavailable fallback ends explicitly.

- [Product matrix](matrix/execution.json): **14/14, zero failures/skips** in 37.6s.
  Real isolated PostgreSQL/Redis and localhost HTTP; recording IM fixture.
  402 issues one request; 429/503/socket-reset use three attempts (two failures,
  one success); half-stream and empty output end failed after three attempts,
  with one notice and successful subsequent human turn. Ledger settlement and
  error redaction are checked. No-first-byte timeout closes three requests;
  queued and in-flight cancellation are covered in reliability/native admission.
- [Detailed HTTP counts](matrix/product-fault-results.json): each attempt has one
  settled ledger row; failed output is not committed as a successful answer.
- [New public-Worker/product tests](basic-qualified/basic-results.json): approved
  fallback issues primary=1/secondary=1, authorization=1, ledger=2, root budget=1;
  absent fallback issues primary=1/secondary=0 and fails; revoked fallback checks
  authorization once, issues secondary=0 and fails. **4/4** including issue157 below.
- [Upstream focused checks](upstream-focused.log): **14/14** on exact 3.5.5 source,
  including embedding402/429 quota circuits, credential isolation, stable vector
  cache identity, stale/wrong-scope vectors, and keyword fallback. Those semantic
  store checks use PGlite and localhost HTTP; they are not a live provider test.
- [Deadline/collaboration boundary checks](upstream-boundaries.log) also passed **20/20**, zero skips, in28.8s. They cover current authorization, recursive mention limits, shared outcomes and first-deadline preservation.
- The legacy 100ms total-timeout test passed here, but this one pass does not
  resolve its known request-count race. The integrator separately owns splitting
  pre-dispatch timeout from issued-request cancellation. This branch does not edit
  `runtime-deadline-recovery.test.ts` or the overlapping 153/161 recovery paths.

## Issue 157

Existing implementation is upstream
[`model/child-admission.ts`](https://github.com/LingXi-Org/LingxiOS/blob/a02e7aab414364f716ff91d6fd0821b42dddabdd/src/model/child-admission.ts),
`control-plane/pg-store.ts`, `collaboration/conversations.ts`, `app/terminal.ts`
and product `agent-runtime/conversations.ts` / `delivery.ts`. Row locking protects
the shared root, startup and closing holds, rejection dimensions, and terminal
outbox identity. Pending children remain capped at8; product mention limits remain
8 levels / 32 runs. No independent child budget or unlimited quota was added.

- [Real PostgreSQL store check](postgres-stores.log): eight concurrent contenders
  admit2/reject6, preserve a closing reservation, and persist one root notice.
  The owning assertions are in upstream `scripts/test-postgres-stores.mjs` at
  the exact source above. This also checks transactions, leases and fencing.
- Focused child-admission tests cover tokens/cost/calls/deadline/reservation,
  eight pending children and ninth denial, cancellation releasing holds, graph
  rollback, and settled near-limit synthetic costs: duplicate settlement charges
  once and rejection creates no child. Existing pricing safeguards are unchanged.
- New product fanout test: an already completed root mentioning two specialists
  retains its answer; child count=0, not-started=2, notices=1. Ingress replay creates
  no work or second notice. The notice cannot wake agents. A new human message
  succeeds with its own root budget; original budget counters remain unchanged.
- Existing product group checks cover A→B→C→A, five-specialist fanout, common human
  principal, frozen audience, attachment evidence and replay. Their current output
  is retained under `matrix/auxiliary/`.

## Harness changes and honest failures

The old matrix overwrote checked-in historical receipts on every integration run
and leaked its temporary database. Matrix/basic capture is now opt-in at the test
hook. The launcher creates a new exclusive directory, accepts loopback-only
alternate service ports, inherits no model credentials, and drops only its generated
database after normal completion or handled failure. Generated names use UUID suffixes.
All four runs, including failed fixture attempts, confirm `databaseDropped=true`.
A final query found zero remaining databases from this task.

`basic-first/` retains **1 pass/3 failures**: the new fixture omitted Worker price
configuration and used the wrong terminal field name. `basic-final/` retains
**2 pass/2 failures**: the fallback driver omitted the primary's `user-text` preview
contract. Correcting only those fixture definitions produced `basic-qualified/`
**4/4**, zero skips, in4.37s. These are harness failures, not fixed product bugs.
`typecheck-first.log` preserves the field-name error; final typecheck and server lint
passed. Original checked-in October19 evidence was restored without alteration.

The independent review found that auxiliary receipt writers still bypassed the new
directory. Group mentions, reliability and provider-timeout receipts now honor
`RUNTIME_ACCEPTANCE_OUTPUT_DIR`; without it they use ignored
`.e2e/runtime-acceptance/<timestamp>-<pid>/` directories. Each write uses exclusive
creation. The launcher forwards the shared output directory. Its seven-file audit
also identified the separately owned deadline writer; **the complete default
selection requires the integrator's deadline fix `fbd7b02b`**. This follow-up does
not edit that test or claim the uncombined selection preserves every receipt.

[Output-isolation checks](receipt-output-green.json) exercise the actual source
filesystem calls, replacing only synthetic payloads: explicit/default locations
and duplicate-file rejection pass **6/6**, after [0/6 before correction](receipt-output-red.json).
They do not execute business logic or use a database. Typecheck, server lint and
script syntax passed; the full matrix was not repeated. The reproducible check is
`node docs/evidence/issues-155-157-basic/receipt-output-isolation.mjs`.
`validation.json` separates initial capture hashes from this follow-up's validation.

## Reproduction

Use Node22 and `npm ci` from this product commit. Start separate local pgvector16
and Redis7 instances; the commands below use ports55442/56389 and a synthetic
local PostgreSQL password. Never use a production or shared test database.

```sh
PROVIDER_MATRIX_PG_PORT=55442 \
PROVIDER_MATRIX_PG_PASSWORD=lingxi-155157-local \
PROVIDER_MATRIX_REDIS_PORT=56389 \
node scripts/runtime-acceptance/provider-fault-matrix.mjs
```

After combining the deadline fix, the default selection includes the four new tests. A fresh timestamp/UUID output
is under `.e2e/provider-matrix/`; set `PROVIDER_MATRIX_OUTPUT_DIR` to a **new** directory
for explicit capture. Server typecheck/lint use the normal package scripts.

For upstream checks, checkout registry gitHead, `npm ci`, `npm run build`, then:

```sh
node --test --test-concurrency=1 dist/test/model-fallback.test.js \
  dist/test/model-recovery-metadata.test.js dist/test/embeddings.test.js \
  dist/test/semantic-memory.test.js dist/test/child-budget-admission.test.js
node --test --test-concurrency=1 dist/test/model-execution.test.js dist/test/collaboration.test.js
LINGXIOS_TEST_DATABASE_URL=<empty-local-disposable-test-database> node scripts/test-postgres-stores.mjs
```

Delete only that explicitly created upstream test database afterwards. Product
launcher cleans its own databases. No long soak is required or claimed.

## Unverified scope retained for the integrator

No new paid provider calls, supplier charge receipt/invoice, full current-version
production Worker+SPA fault journey, current browser run, sustained-load observation
or long soak was performed. The prior real-provider and official browser evidence
keeps its original version/scope; synthetic usage×tariff is never labelled actual
billing. Production process-local circuits do not establish cross-replica provider
availability. This evidence supports **basic capability acceptance under the latest
user instruction**, not those stronger untested claims. Deployment/issue closure
remain the sole integrator's actions.

History read: product PR169–175,185,191,192,194,198,206 and their relevant comments;
upstream PR24–27,30,31 and comments; all issue155/157 comments. No auto-close keywords
are used in this PR's description.
