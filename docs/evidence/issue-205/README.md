# Memory reads and evolution benchmark registration (#205)

## Failure model before implementation

Ordinary memory authorization currently registers an evolution benchmark after
resolving current permissions. A registry lock can therefore delay cold and warm
memory reads and conversation context even when their memory SQL is fast. This
product call was introduced by `236e15c747cc26e67ec4533b4142bab1a0511b0a`, not by
the #196/#197 repair. The existing isolated fixture's 1200 ms registry lock
demonstrates the dependency; it is not evidence of a production lock incident.

The correction must remove registration from scope resolution without caching
authorization, ignoring errors, or losing a cold tenant's evolution capability.
Trusted benchmark definitions must still be frozen before nonempty proposals.
An identity/hash mismatch must roll back the entire synthesis transaction;
model input must not be able to replace that trusted definition. Empty candidate
sets must not touch the registry. Registration must share the owning transaction
and cancellation/deadline behavior rather than borrowing an unrelated connection.

The product regression observes every scope/list operation using the existing
synthetic PostgreSQL fixture: cold/warm reads, 0/8/1024 documents, four concurrent
reads, and the held-registry-lock case must issue no benchmark SQL. The held-lock
read must return within 500 ms while the unrelated lock is held for 1200 ms.
The SQL observer must cover both callback and Promise calls, count each once,
and prove visibility with direct pool and borrowed-client positive controls.
Existing native-memory and memory-scopes tests retain authorization, revocation
and deletion coverage. Upstream owning tests cover cold proposals, immutable identity,
rollback, cancellation and legacy configuration. No live provider or production
fault injection is part of these tests; no new numbered migration is needed.

## Public runtime and product change

[LingxiOS PR #31](https://github.com/LingXi-Org/LingxiOS/pull/31) adds an optional
trusted `evolution.benchmark`, cloned and checked against `benchmarkId`. Only a
committed synthesis with nonempty candidates and current authorized scopes
freezes it, using the same transaction/deadline database as the proposal.
Same-ID hash conflicts roll back the whole action. Legacy benchmark-ID-only
configuration retains its existing requirement for prior administrative freezing.

Runtime **3.5.5** was formally published from
`a02e7aab414364f716ff91d6fd0821b42dddabdd` after its
[exact main gates](https://github.com/LingXi-Org/LingxiOS/actions/runs/39299566868)
and [publication](https://github.com/LingXi-Org/LingxiOS/actions/runs/39300345770).
Both product manifests/locks match its registry version, tarball and integrity.
The product passes its existing trusted definition and calls
`resolveMemoryScopes` directly; no authorization results are cached.

## Isolated measurements

Node 22.23.3, the same local PostgreSQL fixture, synthetic memories, deterministic
model and recording IM. The baseline uses product source `e04041c2`, published
3.5.4, the corrected SQL observer, and baseline assertions. The candidate uses
published 3.5.5. Both observer positive controls count exactly two registry
queries/two acquisitions across direct-pool and borrowed-client calls.

| Measurement (ms) | Before | After |
| --- | ---: | ---: |
| First empty-tenant scope read | 27.09 | 17.78 |
| List while unrelated registry lock is held for 1200 ms | 1209.01 | 19.68 |
| Registry SQL within that locked read | 1188.03 | 0 calls |
| Memory SQL within that locked read | 3.26 | 1.42 |
| Warm list median, 0 / 8 / 1024 documents | 24.29 / 16.96 / 12.01 | 12.18 / 10.09 / 11.07 |
| Four concurrent lists, 0 / 8 / 1024 documents | 58.44 / 35.50 / 28.42 | 37.43 / 23.44 / 22.19 |

All candidate scope/list/native-tool measurements issue **zero** registry SQL.
The regression requires the locked read to finish within **500 ms**. Each warm
cell has 19 samples; the first/cold, lock and concurrent cells have one sample.
These are separate before/after runs, not randomized paired trials or production
SLOs. "First" does not imply a flushed operating-system/database cache. SQL spans
are observations, not an additive decomposition of concurrent wall time.
No P95/P99, provider speedup or production lock incident is inferred.

Raw evidence: [baseline](baseline-3.5.4.json), [regression red](regression-red-3.5.4.json),
[comparison](comparison.json), [candidate](../../../artifacts/memory-latency/candidate.json).

## Correctness and release checks

The new product integration uses actual product control, IM grants, background
capture, public reflection and deterministic independent approval. Its first
empty pass leaves the tenant unregistered; the next nonempty pass creates one
trusted benchmark and one inactive candidate with a pending evaluation, and
commits a successful synthesis receipt. It never seeds runtime evidence or calls
administrative freezing. The 3.5.4 red run reached the proposal's benchmark JOIN
with zero rows; 3.5.5 passes both branches.
[Recorded counts](../../../artifacts/memory-evolution-registration/candidate.json).

Upstream: new tests 13/13, owning regression 50/50, package installation 1/1;
independent review found no P1/P2 and independently reran four critical cases.
Cancellation coverage includes simulated PostgreSQL connection discard in PGlite;
it is not a claim of an actual PostgreSQL socket stress test.
Product: six focused integration files **7/7**, direct command exit **0**;
server **106/106**, web **65/65**, server/web typecheck and lint, web build and
diff checks passed. One earlier combined wrapper reported a nonzero status after
7 passing TAP cases; it is not counted as a passed command. The unchanged suite
was rerun directly and completed with exit 0. The cold product fixture also
passed separately with exit 0. No source workaround or weakened assertion was
introduced for that earlier unexplained wrapper status.

Reproduce against a dedicated test database, after `npm ci --ignore-scripts`
and the standard `npm run db:migrate` with the same installed runtime:

```sh
npm run test:integration -- --file memory-evolution-registration.test.ts \
  --file memory-latency.test.ts --file native-memory.test.ts \
  --file memory-summaries.test.ts --file runtime-auxiliary-latency.test.ts \
  --file runtime-deadline-recovery.test.ts
```

The integration runner requires `INTEGRATION_DATABASE_URL` naming a dedicated
test database and uses its existing hermetic model/IM fixtures.

No numbered product migration is added (the product remains at 46), and runtime
schema 12/protocol 11/kernel 2/assistant message 2 stay unchanged. **Still run the
normal explicit `db-migrate` step**: installation provenance must change from
3.5.4 to 3.5.5 even when no numbered SQL migration is pending. The first local
attempt was correctly rejected by this guard until standard installation ran.
A rollback must likewise use the normal matching-package installation path;
restarting an older image alone is insufficient. Use normal serial CI/CD and
verify actual image identity, aggregate rollout completion, readiness and both
Workers. No live-provider claim or long-soak requirement is added.
