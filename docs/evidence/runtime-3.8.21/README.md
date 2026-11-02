# Formal3.8.21 product61 maintenance qualification

SDK PR82 was independently reviewed and merged. Final maintenance source
`5a80dceb8a9fc28e559e76a9829ee7db157196f8` passed full release gates41190238298
(1255 package/unit checks and39 protocol scripts, no failures/skips), then tag
v3.8.21 publication41191389106 succeeded. `published-package.json` records the
actual registry gitHead, tarball and integrity. Archive SHA512/SHA1, source,
dependencies, exports, files, engines, main/types/bin and native14 schema bytes
were checked. No checkout or development tarball substitutes for the dependency.

Root/server manifests and locks, plus all owning scoped profiles, pin this exact
formal archive. No unrelated dependency graph or migration file changed.

## Exact transition and preservation

Only installed20/product61 to formal21/product61 is accepted. Native14,
protocol11/publicText3/runTrace1 and all61 migration checksums stay unchanged.
Fresh/partial histories, skipped source versions, mismatched receipts/schema,
unknown versions, live work, retained Slides checkpoints and final other clients
are refused. The existing one-CAS/intent/uncertain-observation recovery path is
retained. Current20 additive61 behavior and the historical19 to20 plan identity
remain unchanged (`historical-intent.json`). Target21 startup verifies the exact
already installed61 state and returns without migration, DDL or seed writes.

Bootstrap was executed with actual formal19/20 archives and the official21
package, both for the existing20/product61 test source and a fresh isolated test
database. It reached21/product61 with no target migrations. This test-only source
chain is not a production fresh-install/adoption path.

## Real product sealing regression

`formal20-product-baseline.json` records a narrowed-preview synthetic provider
through the real product Worker/PostgreSQL path. Formal20 emitted interrupted
before final seal and failed. An overlapping first-ACK delay is a success/control
path, not the SDK's separate in-flight-second-ACK race reproduction. Injected
product-host seal refusal remains failed with result_id null.

`formal21-product.json` records the same product cases using the actual formal21
package. The paused answer and delayed-first-ACK control each complete with one
model call, one seal, the exact effective body and only ended=completed. Host seal
refusal still leaves failed with no result. Existing native-v1/v2/v3 correction,
finalization, failed-candidate lineage, IM replay, explanation/activation and
bounded-failure checks remain present and pass. The SDK separately covers its
specific second-ACK race; these product fixtures do not claim that every
persistence_rejected has this cause.

## Executed checks

- Strict CLI/routing/bootstrap/selector checks21 passed.
- Formal19 source60 cases4, formal20 source60 cases4, formal21 source61 cases5,
  product suspension/control cases3, recovery/lineage cases15, native activation
  cases8, artifact boundary cases6 and Slides workspace cases4:49 unique cases
  passed, zero skipped.
- The first artifact-boundary attempt returned404 because the isolated local
  editor bundle had not been built. No assertion was removed or changed. After
  the repository's required `node --test scripts/slides-editor.test.mjs` build
  and5 checks, all6 original boundary cases and4 workspace cases passed.
- Production Web build, server typecheck/lint and scoped-lock verification passed.

Reproduction uses a dedicated local test database and the existing guarded
`server/scripts/bootstrap-runtime-patch-test-db.mjs`, followed by the eight owning
files through `server/run-integration-tests.mjs --file`. The current ordinary
integration/CI entry retains the actual19/20 fixtures and runs all21 target cases.

These are deterministic product tests with a synthetic provider, not a replay of
a private production conversation or live-model/teaching-content approval.
The three UI candidates had separate cloud Chromium checks. #579 new citations,
#605 original network behavior and #606 actual numerical content still require
Lenovo production acceptance. No issue is closed by this release evidence.
