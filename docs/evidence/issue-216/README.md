# Issue 216 qualification and integration handoff

Both phases are implemented together in [OS PR33](https://github.com/LingXi-Org/LingxiOS/pull/33) and [Loop PR224](https://github.com/LingXi-Org/LingxiLoop/pull/224). These remain draft source qualifications. The sole integrator publishes the coordinated native version, pins its exact version and lockfile, runs release CI, and owns production migration/backfill/deployment and closure.

Base main: `b7b165fd704f8d1f22fe8b70b47bfc8d70e02275`; deployment image pin `2ea8615c17c9ed11b769c83c699719dc01c11ee4`; native3.5.6/schema12/product46. Candidate: native schema13/product47. The committed dependency remains 3.5.6 until official publication, so this draft cannot pass clean release installation yet. Qualification uses an npm-packed upstream source package through public exports; other packages come from the existing lockfile. No internal runtime code is copied into Loop.

Main was checked again at 03:42 UTC: `0a7fd57c`, with #221/#222 merged and deployment configuration pointing to `035a8e11`. This contributor did not deploy or inspect that production receipt. Keep those changes during integration; this isolated branch and its baseline measurements remain based on b7b165fd.

## Acceptance mapping

| Boundary | Executed evidence |
| --- | --- |
| Immediate cross-room/thread/Agent inheritance and actual model input | `memory-continuity.test.ts`, deterministic real PostgreSQL/runtime and captured model input; configured-provider check separately below |
| Real course/project ownership; other course/user/tenant and shared audiences | Same owning integration, including current membership change and Agent departure |
| Migration | Public API moves only proven private records; ambiguous/no-source/expired/group records stay isolated; repeated migration and post-delete rerun do not revive records |
| Explicit write/correction/version/restart/compaction | Public memory API, version history, three installed native compactions, control restart and five verified model inputs retaining the core; the lossy continuity summary deliberately omits that fact |
| Long Chinese middle/tail and effective revisions | Native segmented cursor tests; configured-provider extraction is a separate check |
| Budget and background recovery | Native bounded allocation, fragments, incomplete capture, page idempotence, retries, cancellation, epoch and current-version vector tests |
| Forget and historical cards | Real HTTP/native PostgreSQL reads in two rooms, repeated deletion, second-chip deletion, retained fact, revoked read/delete; official browser double-card invalidation and reload |
| Teaching state | Existing learning records remain authoritative; synthesis policy rejects mastery inferred merely from assistance |
| Native migration | 0047 + native015 + provenance share one transaction; active Worker and Web capture claims block; repeated apply is no-op; guarded pre-activation rollback/reapply and post-activation refusal pass |
| Privacy | Five native sentinel cases cover both payload-trace entry points and identity/throwing redactors. An additional durable capture → scheduler → real JSON logger sink case verifies callback text does not leak and failed work remains retryable. Full authorized model/action receipts remain; diagnostic memory copies are removed. Historical event rows are not deleted |

Original native-memory + memory-summaries baseline passed 2/2 in 36653 ms. Owning product/migration regression passed 36/36 in 169873 ms; later expanded continuity and summaries passed 3/3 in 60812 ms. Final HTTP historical-card plus native-tool check passed 3/3 in 75456 ms. Original service tests passed 106/106. Native final combined suite passed 163/163, plus the fixed-dimension embedding contract 3/3. Browser checks passed 3/3 in 49770 ms using tester-army/e2e 0.17.0 and its official @e2e-dev/web engine. Browser screenshots use synthetic receipts/API fixtures; the HTTP/native check is separate and is not represented as a browser-to-production run. No direct Playwright was used.

The `MemoryTool` and `memory-query` provider ownership were taken from PR221 commit `121de820`; preserve that upstream fix when resolving the PR221/224 overlap. This branch adds current-only rendering, identity-wide cancellation/invalidation and a two-run regression. Readonly, inaccessible, failed or still-loading states never fall back to an old receipt summary.

## Reproduce

```sh
node e2e/server/memory-regression.mjs memory-continuity.test.ts memory-summaries.test.ts native-memory.test.ts migration.test.ts
OPENAI_EMBEDDING_MODEL=BAAI/bge-m3 EVAL_CANDIDATE_MODEL=zai-org/GLM-5.2 EVAL_CANDIDATE_INPUT_CNY_PER_MILLION=8 EVAL_CANDIDATE_OUTPUT_CNY_PER_MILLION=28 lingxi-prod model-run node e2e/server/memory-regression.mjs --live-continuity
MEMORY_LATENCY_LABEL=candidate node e2e/server/memory-regression.mjs memory-latency.test.ts
npx vite build --config e2e/memory-privacy.vite.config.ts
# Serve the built fixture with its existing Vite preview, then:
E2E_MEMORY_PRIVACY_FIXTURE=1 E2E_BASE_URL=http://127.0.0.1:52996 E2E_BUILD_INDEX=artifacts/memory/site/e2e/memory-privacy.html npm run test:e2e:web -- e2e/web/memory-privacy.e2e.ts
```

The runner restricts itself to isolated test databases and passes the already configured proxy/CA variables without weakening TLS. No real credential is stored in these artifacts. `memory:maintain <companyId> <principalId> <runId> inspect|migrate|reindex [cursor]` invokes only native public APIs and checks the current product run identity. Inspect/migrate pages are bounded and resumable; retain the sanitized result mapping and isolation reasons. Production must drain old Web and Workers before setting `LINGXIOS_SCHEMA_UPGRADE_DRAINED=true` and running migration47. See the upstream operations document for the guarded rollback boundary.

## Configured provider and measurements

Final provider result and same-condition latency files are populated after the running qualification completes. Early Qwen failures, a model clarification request, an ambiguous question selecting formatting preference, an invalid synthesis proposal, and the fixed-size BGE dimensions HTTP400 were real failures, not counted as passes. The official BGE model is free at the checked endpoint; its token/call/time accounting still uses the shared ledger. The existing production model/key/endpoint are preserved.

Two original-root measurements accidentally loaded 3.5.2 and are excluded. Valid baseline runs use b7b165fd with the official 3.5.6 package. Contended measurements are retained privately but are not used to claim a performance improvement. Synthetic/native/provider/production evidence are distinct. Production acceptance and a post-publication exact lockfile rerun are not performed by this contributor.
