# Explicit correction replacement

A runtime-requested correction could append a full rewritten answer to the
candidate it was repairing. The product correctly retained both declared
sources, so text similarity or a product-side forced replacement could not
safely repair the upstream mistake.

LingxiOS PR65 binds a correction to the ordered, sealed candidate source IDs.
Its next substantive answer must explicitly replace that candidate. A different
operation is rejected before substantive streaming and again before sealing a
non-streaming result. The fenced correction intent survives restart and a
necessary tool continuation; a valid replacement retires it. Ordinary A → tool
→ B answers still append. Calls remain metered, failed replacements retain the
old candidate, and authorization, cancellation and side-effect checks remain.
No model judge, text deduplication, extra automatic model call or schema
migration was added.

Upstream source: `121ae5cca118f9980c6a89b24b7ee41a7dd82f2c`, version 3.8.12.
The final source passed [release gates 40088129479](https://github.com/LingXi-Org/LingxiOS/actions/runs/40088129479).
The source owner's 20 targeted checks cover append, explicit replacement,
invalid append rejection, metering, cancellation, source integrity and durable
repair recovery. The corrected denied-tool fixture retains its strict two-call,
zero-business-execution and permission assertions; valid/denied/unknown-effect
cases passed 3/3. These are synthetic checks, not an acceptance result for a
private production conversation.

## Formal package and product checks

The normal npm publication completed on 2026-10-24 after all 1198 package checks
passed. The actual registry package reports version `3.8.12` and the source commit
above. Its 536 regular files equal the freshly qualified local package byte for
byte, with no normalization. Both archive SHA-256 values are
`379f6cb7669a556a5e930e836927e8c7f539993a174fdd4a10923221ab31af7e`.
Root and server package manifests and locks pin that exact published version,
registry URL and integrity. Its transitive dependency declarations are unchanged.

Against the actual published package, server typecheck passed, answer-segment
projection passed 5/5, and the selected integration suite passed 6/6 across
`runtime-tool-recovery.test.ts` and `runtime-patch-provenance.test.ts` (16.817 s).
The latter used an isolated synthetic PostgreSQL database and Redis namespace;
no provider request or production database mutation was made. Initial local
setup failures from omitted sparse-checkout assets and a missing test environment
value were corrected before these successful runs; no assertion was weakened.

Two earlier normal publication attempts on the prior source failed in short SSE
test-fixture deadlines before upload. [OS PR67](https://github.com/LingXi-Org/LingxiOS/pull/67)
separated semantic fixture deadlines from dedicated timeout tests, retaining usage,
empty-response, cancellation and timeout assertions. It changed only one test
file. The original failures remain recorded; this is a new qualified source.

The production deployment receipt will be linked from issue #406 after actual
rollout. These package and synthetic checks do not assert that the private
production report has been reproduced or re-tested.
