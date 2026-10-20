# 2026-10-20 batch closure and continuing development

At2026-10-20T16:17:33UTC the user explicitly changed the acceptance scope: stop extra acceptance work, finish this batch's merge/deployment/closure using existing CI and evidence, and continue development of known problems. Closing an issue here does not assert that every originally proposed test passed. No further browser sandbox/TLS workaround, official-site comparison, clipboard permission override, cold/warm benchmark or long soak is a gate for this batch.

This batch is issues213–219 and229, plus their existing implementation/release PRs. Later issues for removing activity-summary controls and interleaving user-visible text with memory-tool calls are new work and must remain separate; do not close them as old backlog.

## Delivery and closure basis

| Item | Delivery / closure basis | Honest remaining scope |
| --- | --- | --- |
|213|Previously delivered and closed|No repeat acceptance requested|
|214|Streaming renderer changes already deployed; PR240 adds native-media fixture|Native reduced-motion browser assertion and official-live comparison unrun/blocked; waived as this batch's gate|
|215|Previously delivered and closed|Fixed3.5.3 soak remains untouched|
|216|5old records migrated, original25accounted as5stable+20isolated; authorized20/20current indexes,missing0;45independent checks;closed|Public maintenance CLI Redis cleanup is included throughPR242; no replay of completed content migration|
|217|Previously shipped loading/toolbar/trigger work|Known generated-content quality red examples remain active development:500vs166.67 calculation, n=20/label/inequality correctness, trendpartial quality. Existing clipboard permission denial and physical touch were not passed|
|218|Standard activity cards already deployed; PR240 adds actual expansion assertions|Two390/1440expanded-state browser cases and official-live visual comparison unrun/blocked; waived as batch gate|
|219|Existing native editor/forum UI delivered; PR240 adds public CDP/environment passthrough|Two menus plusoneforum-state native-motion cases unrun/blocked; waived as batch gate|
|229|Published payload/Canvas trim delivered; Canvas compressed OCI decreases13,021,932bytes(6.3226%)|Broader removal work and controlled cold/warm/peak-disk measurements remain separate follow-up, not a gate|

PR237/239 published the accepted Canvas candidate9a5; PR241 fixes only the deployment-test fixture and passed exact CI. PR240 is test/config only, with full owning TypeScript check passed and6selected/0executed browser cases. PR242 fixes only maintenance CLI lifecycle and has7natural-exit tests plus3independent exception cases, server lint/typecheck and server CI passed. Its merged main base also includes the PR241 fixture repair. Final publication SHA, native receipts and health will be recorded in the associated release evidence; do not treat this pre-release document as a deployment receipt.

## Known work to continue

- For217, accept the original author's contract-fix draft and retained real red examples, repair the owning code and run targeted deterministic checks. Do not repeatedly pay for broad provider reruns. Do not claim generated semantic quality is solved by rendering or transport success.
- The new request removes “查看全部活动（7 条）” / “查看需要注意的记录（1 条）” style controls and addresses prolonged memory-tool silence through real interleaved user-facing text/tool orchestration. It must not fabricate progress or reveal hidden reasoning. Parent assigns independent development; the sole integrator will serialize its later release.
- If a usable sandboxed test browser and normal TLS trust become available, the6PR240 cases have exact commands; completion is optional follow-up under the user's revised scope. Current failure is a single Chromium bootstrap exit134/No usable sandbox, not6failed application assertions. No sandbox bypass or TLS bypass was used.
- Broader production-payload cleanup must be supported by actual dependency/reference evidence; measured image-size gains must not be converted into unmeasured build-time or peak-disk claims.

## Evidence

- [Canvas production acceptance](../release-215-216-219/canvas-production-20261020/README.md)
- [Actual memory content/index receipts](../release-215-216-219/memory-maintenance-20261020/README.md)
- [PR240 exact-source selection, full typecheck and sandbox blocker](../release-215-216-219/pr240-root-review-20261020/README.md)
- [Exact six-case commands](../remaining-ui-browser-214-218-219/README.md)
- [CLI lifecycle failure model and targeted tests](../issue216-memory-cli-cleanup/failure-model.md)

No credentials, permissions, durable volumes, old schema/checksums or paused3.5.3observation were changed by closure. Pending/new code is not merged merely to make an issue count zero.
