# Independent shared-projection review: PR267, PR270, PR271

## Decision

- PR267 `d88c4b5d0e42ba6d4bd48785c526c18e888dfa48`: code GO. Latest exact-head server/deploy/integration CI succeeded. Parent corrected the body to “Partially addresses #260”; keep260 open. Original private403 incident remains unverified.
- PR270 `38ec4af6d79b695792a2d4afc369ee8161767fb5`: code GO within the reviewed public projection scope; latest exact-head server/deploy CI passed and integration remained pending.
- PR271 `f2d4509e2fe696dedbb8eadbd13fb4e9c3fcc520`: **NO-GO pending one P2 code correction and integration CI**. Web CI also has a locally reproduced fixture expectation regression; its minimal correction is supplied separately.

## P2: confirmed delivery failure presented as waiting

`server/src/agent-runtime/observed-progress.ts:19-20` returns “可视化展示引用已生成，正在等待答复交付。” whenever the current message has a reference, even when the public `view.delivery` is `failed`. The formal3.6.0 public DeliveryState explicitly distinguishes pending/delivered/failed/not_observed. After a successful save and committed candidate whose outbox delivery fails, this reports ongoing waiting instead of the observed terminal failure; the reference also remains correctly inert, leaving only the misleading status.

`failed-delivery-repro.json` reproduces identical text for pending and failed using the real public `consumeAssistantMessage`, current-request tool receipts and unchanged product projection. Synthetic only, zero external calls. Smallest correction: branch on the explicit failed delivery before waiting copy, preserve all reference/delivery authorization gates, and add one pending-versus-failed regression. No product correction was made in this review.

## Shared logic and merge order

The three PRs independently descend fromc66e847d. Recommended order **267 →270 →271 → test-only14dba6e0**. The first three cherry-pick cleanly in an isolated sparse review branch; no product conflict resolution was needed.

-267 removes active reference syntax from unverified commentary/history using the existing Markdown-aware projection; delivered answer refs remain unchanged.
-270 uses native part/attempt/request/fence/end identity, not text equality, to archive replaced no-tool candidates while retaining legitimate tool preambles and authorized history. Existing accepted-result association still owns acceptance. The formal runtime ends the successful final public segment as completed before publishing the additional model.delta, matching the deduplication trigger. No private reasoning or new aggregate UI is introduced.
-271 adds closed status copy from public lifecycle/current-request receipts and labels known tools. Its public progress remains distinct from generated semantic content. The new host instruction requests explanations but does not guarantee a real provider's timing; the private incident timing remains unknown.
-Foreground/history paths, committed persistence and renderer entry points were traced. Cross-conversation403, company scope, membership/revocation, path validation and final-reference verification are unchanged.

## Minimal local checks and supplied fixture correction

Review tree: `/workspace/LingxiLoop-public-projection-review`, branch `review/public-projection-267-270-271`.
Combined product-only review HEAD: `5865eec93709e2ff5f44dc703fcd0aa3693df3c3`.
Final local **test-only** commit: `14dba6e09b0fa76cf9bd2902f9bb8b8d74fd987c`, not pushed. Parent may cherry-pick this single final commit after integrating the product PRs. Patch: `combo-fixtures.patch`.

Only two tests changed:
1.267's stale-commentary fixture now expects the replaced candidate absent from final foreground after270; authorized history still retains its text, every stale ref stays inert and the correct final ref remains.
2.The existing Web harness queued-state fixture expects271's exact labelled factual waiting text instead of an empty array. It still rejects the old answer/citation payload; queued-with-draft and subsequent answer checks remain unchanged.

Evidence:
- `combined-boundaries-red.log`: original three new suites7/8; only267/270's incompatible fixture failed.
- `combined-boundaries-green.log`:8/8 after that test-only correction.
- `web-harness-red.log`: existing affected Web harness5/6; queued empty-array expectation failed.
- `web-harness-green.log`:6/6 after exact queued-text expectation correction.
- `run-activity-lint.log`: only changed shared copy file linted, passed.
- Earlier267 exact-head boundary check independently2/2 passed at `/workspace/pr267-review/independent-boundary.log`.

Author-reported12/6 and13/8 broader regressions and the real Worker/PostgreSQL/local-provider flow were read but not rerun. No model/provider/browser/full suite was added.

## CI and limits

Public job metadata identifies271's failed step as `npm run lint && npm test`; the affected shared copy lint is independently green and the owning Web harness failure is independently reproduced. Full job-log download received HTTP403 at GitHub's redirected artifact host; it was not retried or bypassed. Public annotations only say exit1, so this report does not claim to have inspected the inaccessible complete log or excluded every other full-suite failure. Parent must run final exact integration CI after fixes.

All PR/issue bodies, comments and inline reviews were read (no comments/reviews at observation). Full latest check snapshots are retained in `pr267-final.json`, `pr270-final.json`, `pr271-final.json`; checks were not polled to completion.

No production API/SQL/private conversation/HTML/screenshots/forbidden diagnostics access; no network/security/credential changes, installs, builds, push, merge or deploy. Only public Git/GitHub evidence, the existing formal package and synthetic local projection were used. The current266 release is independent.
