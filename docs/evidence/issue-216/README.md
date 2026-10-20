# Issue 216 qualification and integration handoff

Both phases are implemented together in [OS PR33](https://github.com/LingXi-Org/LingxiOS/pull/33) and [Loop PR224](https://github.com/LingXi-Org/LingxiLoop/pull/224). These remain draft source qualifications. The sole integrator publishes the coordinated native version, pins its exact version and lockfile, runs release CI, and owns production migration/backfill/deployment and closure.

Base main: `b7b165fd704f8d1f22fe8b70b47bfc8d70e02275`; deployment image pin `2ea8615c17c9ed11b769c83c699719dc01c11ee4`; native3.5.6/schema12/product46. Candidate: native schema13/product47. The committed dependency remains 3.5.6 until official publication, so this draft cannot pass clean release installation yet. Qualification uses an npm-packed upstream source package through public exports; other packages come from the existing lockfile. No internal runtime code is copied into Loop.

Main was checked again at 03:42 UTC: `0a7fd57c`, with #221/#222 merged and deployment configuration pointing to `035a8e11`. This contributor did not deploy or inspect that production receipt. Feature-branch merge `754cde96` incorporates that main and resolves the three memory-card conflicts while preserving its provider ownership and Chinese labels. The comparison baseline remains b7b165fd.

## Acceptance mapping

| Boundary | Executed evidence |
| --- | --- |
| Immediate cross-room/thread/Agent inheritance and actual model input | `memory-continuity.test.ts`, deterministic real PostgreSQL/runtime and captured model input; actual configured-provider cross-room input and answer also passed |
| Real course/project ownership; other course/user/tenant and shared audiences | Same owning integration, including current membership change and Agent departure |
| Migration | Public API moves only proven private records; ambiguous/no-source/expired/group records stay isolated; repeated migration and post-delete rerun do not revive records |
| Explicit write/correction/version/restart/compaction | Public memory API, version history, three installed native compactions, control restart and five verified model inputs retaining the core; the lossy continuity summary deliberately omits that fact |
| Long Chinese middle/tail and effective revisions | Native segmented cursor tests plus actual configured-provider explicit save, background extraction and new-room answer; current name and weekly habit both recovered |
| Budget and background recovery | Native bounded allocation, fragments, incomplete capture, page idempotence, retries, cancellation, epoch and current-version vector tests |
| Forget and historical cards | Real HTTP/native PostgreSQL reads in two rooms, repeated deletion, second-chip deletion, retained fact, revoked read/delete; official browser double-card invalidation and reload |
| Teaching state | Existing learning records remain authoritative; synthesis policy rejects mastery inferred merely from assistance |
| Native migration | 0047 + native015 + provenance share one transaction; active Worker and Web capture claims block; repeated apply is no-op; guarded pre-activation rollback/reapply and post-activation refusal pass |
| Privacy | Five native sentinel cases cover both payload-trace entry points and identity/throwing redactors. An additional durable capture → scheduler → real JSON logger sink case verifies callback text does not leak and failed work remains retryable. Full authorized model/action receipts remain; diagnostic memory copies are removed. Historical event rows are not deleted |

Original native-memory + memory-summaries baseline passed 2/2 in 36653 ms. Owning product/migration regression passed 36/36 in 169873 ms; later expanded continuity and summaries passed 3/3 in 60812 ms. HTTP historical-card plus native-tool check passed 3/3 in 75456 ms. Original service tests passed 106/106. Native combined suite passed 163/163; subsequent affected synthesis/embedding/collaboration checks passed 28/28, real capture/sink plus synthesis 11/11, and final bounded-page/synthesis checks 11/11. Final browser checks after main integration passed 3/3 in 53860 ms using tester-army/e2e 0.17.0 and its official @e2e-dev/web engine. Server/UI typechecks and server lint passed; the production fixture build passed. Browser screenshots use synthetic receipts/API fixtures; the HTTP/native check is separate and is not represented as a browser-to-production run. No direct Playwright was used.

Final current-main product rerun (`memory-continuity`, `memory-summaries`, `native-memory`) passed 5/5 in 49170 ms, covering the three-compaction/restart case, actual HTTP cross-room/revocation behavior and reviewed tool writes/activity projection. A test hook was corrected to close the shared pool after both cases; no valid assertion was removed.

The final full production web build and E2E typecheck also passed. UI lint completed with five existing warnings and two informational findings; server lint passed. Filtered TAP case names/counters are retained in [tap-results.txt](tap-results.txt), and source/package provenance and remaining gates in [qualification.json](qualification.json).

The `MemoryTool` and `memory-query` provider ownership were taken from PR221 commit `121de820` and preserved in the current-main merge. This branch adds current-only rendering, identity-wide cancellation/invalidation and a two-run regression. Readonly, inaccessible, failed or still-loading states never fall back to an old receipt summary.

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

Actual provider qualification passed 1/1 in 68495 ms on native source `47883b3` and product `754cde96`. [model-results.json](model-results.json) records 34 actual HTTP requests, all HTTP200; all 34 calls have measured usage, including 10 embedding calls. Shared-ledger cost is 339003 micros (USD 0.339003, using the explicitly configured pricing conversion). Three initial documents have current 1024-dimensional vectors in one space; subsequent automatic recall reports hybrid retrieval and injected references. The observer forwards provider requests unchanged and records only synthetic booleans, counts, statuses, timings and budget data. The successful run covers explicit long-input middle/tail, immediate new-room core input/answer, nonlexical semantic recall, complete background middle/tail extraction, effective revision, new-room inheritance and forget/index removal.

Earlier provider failures are not passes: unsupported BGE dimensions, ambiguous questions, invalid proposals, rejected assistant-only pages and an omitted middle fact informed the fixes. Long-source extraction now uses 14 KB pages with at most two segments per source; no human evidence is skipped. Assistant-only pages cannot independently establish user facts. The official BGE model is free at the checked endpoint; token/call/time accounting still uses the shared ledger. Existing production model/key/endpoint are preserved. Provider quality is evidenced by this bounded synthetic qualification, not guaranteed for arbitrary future model output.

Sequential same-condition local measurements are in [latency-summary.json](latency-summary.json), with original individual samples beside it. For 0/8/1024 records, warm list medians are 21.70/21.10/23.04 ms on official3.5.6 and 33.50/35.44/31.36 ms on the candidate. Current authorization before/after reads costs 8–14 ms here. Single native-run observations are 1276/1042/979 → 1480/1287/1548 ms; no overall speedup is claimed. Both versions pass the no-evolution-registration and unrelated-lock bypass gates (lock probe 45.1 → 34.1 ms). Sample counts do not support tail-percentile claims.

Two original-root measurements accidentally loaded 3.5.2 and are excluded. Valid baseline runs use b7b165fd with the official 3.5.6 package. Contended measurements are retained privately but are not used to claim a performance improvement. Synthetic/native/provider/production evidence are distinct. Production acceptance and a post-publication exact lockfile rerun are not performed by this contributor.

Remaining release gates: sole-integrator coordinated official native publication (suggested compatible minor3.6.0, no version reserved by this branch), exact package/lock update, independent final review/CI against the integrated release commit, verified Web+Worker drain, production migration47/native015/provenance transaction, authorized migration/backfill and actual deployed-image acceptance. These drafts do not authorize issue closure by themselves.
