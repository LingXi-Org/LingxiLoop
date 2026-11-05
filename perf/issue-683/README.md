# Issue 683: live generation qualification

The receipt-chain and `slides.current` title/slideCount fixes are already in formally published LingxiOS3.8.25 and merged product PR#688. This work does not reimplement them. During the real-provider whole-deck sample, `task.check_resource(slides.current)` actually passed with the saved title and six-page count.

The live chain is **not fully qualified**, and these samples do not establish a production speedup. First-page saving produced an earlier server readiness signal in one incremental sample, but the repeat was slower and both requests later failed; the whole-deck control did not follow its assigned single-write policy. The run did not proceed to the full three-pair matrix after this qualification failure. An additional incremental diagnostic sample is recorded separately below. Further paid sampling stopped at the provider HTTP429 response, without changing credentials or limits.

## Concrete fixes

- New Slides defaults projected at the product boundary now use400 rather than the upstream variable font weight430, which the actual editable HTML checker rejects. Both deck-style text and installed Slides tokens agree. Pinned upstream bytes, Design tokens and previously saved documents retain their values. The host skill explains the projection and the create-before-design_systems prerequisite.
- Product save/install conflicts use the published runtime's `version_conflict` code. The old `conflict` code became an unhelpful `transaction_rolled_back`; a real PostgreSQL + formal Worker regression failed before the fix and passed afterward, with `no_effect`, version classification and refresh recovery. Existing CAS, editor-busy and authorization guards remain enforced. This proves the classification defect; the first pilot's original rollback arguments were not retained, so its exact cause is not asserted.

## Conditions and measurements

Code candidate826116a3 (same product code for both measured strategies), baselinebb1186f4; exact runtime3.8.25. Six-page public synthetic TCP request and both policies are in each `result.json`. Existing DeepSeek-V4.1-Flash on SiliconFlow, native-v3 public answers, max output16,384; no private production request/manuscript replay. Node24.19.0; fresh PostgreSQL16/pgvector and Redis7 per sample, actual formal24→25/product62 bootstrap, product authorization and shared LLM ledger, one local Worker, recording IM, embeddings disabled. Measured runs use32 calls/2,000,000 tokens/480s root limits and180s provider-request timeout. The test uses the public Worker factory defaults; it does not reproduce production Worker concurrency, all performance switches or its default DeepSeek90s request timeout.

First readiness is enqueue→the post-write `tool.completed` event matching the earliest revision with a nonempty valid index and all referenced HTML present. Revision creation alone is a transaction-start lower bound. Neither is browser first paint. Model-latency sums can overlap other work and are not added to wall time. Answer deltas may be progress text, not a completed deliverable. Canonical runtime model-call counts and the shared ledger match for all three measured samples.

| Sample | First complete saved index | Final wall time | Calls | Final saved pages | Format problems | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| incremental-pilot (before fixes) | ~56s /1page | ~195s |19 |5 |0 |partial; budget exhausted; one rollback, unsupported430 corrected by model |
| incremental-01 |28.940s /1page |222.065s |9 |1 |0 |partial;179.982s provider request failure; one invalid edit |
| incremental-02 (diagnostic repeat) |90.271s /1page |185.154s |20 |3 |0 |partial; recovered timeout then provider HTTP429; one version conflict |
| whole-01 |57.127s /6pages |190.368s |20 |6 |0 |partial; assigned single-write policy not met; four safely rejected version conflicts |

The initial pilot used a24-call limit and implicit SDK token defaults. Its Date-to-string conversion floored event timestamps to seconds; it is retained as a failure diagnostic, excluded from the millisecond comparison. The measured matrix corrects that conversion and records explicit budget rows. No failed sample is discarded or called a completed request. `accepted` is deliberately stricter than saved-file completeness: it also requires a satisfied, delivered run with no failed native actions. Call metrics, check totals, final files, revision metadata and failure metadata are retained next to each sample.

There is no p75/p95 estimate, no credible causal comparison between strategies and no claim about the historical690.973s production run. Both strategies already receive the current product's incremental guidance; the whole-deck request was not an effective controlled baseline.

## Browser and export evidence

`browser-whole01.json` uses the real six-page model snapshot, the built production Slides editor and Chromium through CDP (no Playwright), with a local HTTP API fixture and20ms/4Mbps/3Mbps throttling. One cold opening and one reopening, no percentile claim. Cold/reopen became editable in3626.5/3172ms in this fixture. Editing the first title to“测试”, saving, reopening the saved change, undo/redo, presentation entry/exit and PDF/HTML/PPTX downloads passed; browser exceptions were empty. Export bytes and hashes are recorded. The source snapshot is unchanged; downloaded exports include the deliberately edited test title.

`pdfinfo` reported6pages. Poppler rendered all six exported PDF pages; pages1–6 were visually inspected at up to1100px. The original first-page editor screenshot is under `screenshots/`. No clipping was observed in that check. The PDF/HTML/PPTX export files remain local under `/tmp/683-exports-whole01`; their hashes are durable in the report. PPTX was checked for ZIP signature and download bytes, not opened in Microsoft Office. Authentication/real IM latency and actual production browser saving are not established by this fixture.

Format success is not subject-matter certification. Manual review of the generated whole sample found ambiguous ACK scenarios on page3 and insufficient subsequent segment arrivals in the fast-retransmit examples on pages4/6. The classic fast-retransmit condition is three duplicate ACKs ([RFC5681 §3.2](https://www.rfc-editor.org/rfc/rfc5681.html#section-3.2)); the diagram shows only one out-of-order later segment. These original generated files are deliberately retained, not silently corrected or presented as teaching-quality acceptance.

## Validation and remaining boundaries

Observed before/after regressions: unsupported default font test failed before the implementation; CAS Worker regression5passed/1failed with the old code, then6/6passed with the fix. Server unit suite208/208passed, `server:typecheck` and `server:lint` passed. The strengthened final CAS regression also passed6/6, including the model-visible refresh hint and an unchanged file before recovery; the live test without its opt-in flag skipped with exit0. Final CI status is recorded in the handoff.

The original private production content, production first-body/paint timing, full real-auth browser flow, multi-worker load and teaching-quality qualification remain uncovered. Production deployment belongs to the designated sole release integrator. A draft PR or successful local check is not a production release.

## Reproduce on isolated services

Use the repository integration environment with dedicated test PostgreSQL/Redis and an already authorized SiliconFlow model configuration; the runner refuses a production database. Do not print provider keys. Bootstrap with `node server/scripts/bootstrap-runtime-patch-test-db.mjs`, then run:

```sh
LINGXIOS_LIVE_SLIDES=1 SLIDES_SAVE_STRATEGY=incremental SLIDES_SAMPLE_ID=local-incremental SLIDES_EVIDENCE_PATH=perf/issue-683/local-incremental npm run test:integration -- --file runtime-slides-generation.test.ts
node scripts/slides-workspace-benchmark.mjs --generated=perf/issue-683/whole-01 --runs=1 --regression=true --out=/tmp/683-browser.json --exports-dir=/tmp/683-exports
```

The live test is explicitly opt-in and makes real paid model requests; ordinary CI skips it. All saved experimental samples include failed native actions or incomplete outcomes, and their nonzero qualification exits are preserved. No model sampling continues after the recorded HTTP429 limit.

After rebasing onto main e18af1fe (#694), the editor was rebuilt and the same snapshot passed the complete browser regression again: see `browser-whole01-final.json` and `screenshots-final/`. Cold/reopen editing readiness was3570.4/3192.4ms in this one-run fixture. Final PDF still has6pages; its six1100px Poppler images were byte-identical to the previously inspected images. This rerun establishes compatibility with the new editor build, not a before/after performance claim.
