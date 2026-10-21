# Skill loading, visualization delivery and RunActivity release

Target application commit: `d601b461fbde5da05bc94b27d8dae565935de21c`.
Runtime `3.6.0`, native schema `14`, product schema `50`, control-plane protocol `11` remain unchanged. This release performs no schema migration.

The source batch merges PR276 (#272), PR277 (#273), PR278 (#274), PR279 (#275) and PR281 (integration fixtures).

- **#272:** selected built-in skills receive their complete trusted specification through the host after one authorized selection. The synthetic primary chain uses one selection, no pagination, and four model generations. This removes the reproduced repeated-page path; it is not a production provider latency measurement. The 128K/default-output mandatory-budget failure remains documented, without claiming a same-input baseline comparison or increasing production context settings.
- **#273:** saving returns the exact persisted reference/version/hash. Bounded delivery repair exposes only authorized current-request metadata and never automatically selects an older or invalid artifact. Three corrected versions are delivered in the synthetic chain within the existing root limit; the deliberately exhausted control remains an honest non-delivery. The synthetic evidence does not establish permanent missing delivery or budget exhaustion in the original private case.
- **#274:** safe resource GETs recover from a reproduced stalled or interrupted transfer within the existing 15-second total deadline. The retained synthetic network comparison is 15.037 seconds to failure versus 5.754 seconds to usable content. Authorization errors, page-creation POSTs and Retry-After responses are not blindly retried. This is not a diagnosis of the original private production case.
- **#275:** native tool/message identities move recognized public process narration into the default-collapsed RunActivity while substantive answers remain streaming. The removed activity-count entry points stay removed. Runtime 3.6.0 lacks purpose before an arbitrary first chunk: an unresolved candidate can initially appear in the answer, and arbitrary process prose embedded in a final answer cannot be reliably classified. #275 therefore remains open; #280, upstream LingxiOS PR39 and Loop PR282 track native purpose metadata. Declared purpose is also not a semantic guarantee that a model never mislabels prose.

## Exact-source checks

- [Server and integration CI39626960143](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39626960143): successful on the target commit. Integration: 381 tests, 367 passed, 14 skipped, zero failed or cancelled.
- [Web and image CI39626974534](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39626974534): successful on the same target commit; only the application image was published.
- The previous b8f29 server CI failed on two obsolete prompt assertions and five commentary-only waits. PR281 updates those fixtures without changing product code; their final checks preserve durable streaming, cancellation, authorization, replay and private-reasoning boundaries. The failed run remains recorded and is not reported as successful.
- Independent source, release-input and image reviews passed. All 22 linux/amd64 layers were verified; the installed formal runtime and PDF package inventories matched.

Image index: `sha256:b65c0ffd869bc4fbffffa789820aee35b4266e9ecc1736186224fa783b28286d`.

## Production result and interruption

The target is deployed and accepted after a separately reviewed recovery. Recovery completed at **2026-10-21 16:17:16 UTC**; the read-only postflight finished at **16:19:14 UTC**, and final acceptance passed all **8 checks** at **16:22:21 UTC**. Both Web containers and both Workers report the target commit/image, healthy with zero restarts and no OOM. Three hosts report healthy, both application stacks are idle, and `/api/health`, `/readyz`, `/api/health/dependencies` and `/api/meta` all returned HTTP 200. Runtime/native/product/protocol provenance remains 3.6.0/14/50/11.

**The original attempt did not complete.** After A Web deployed, strict environment comparison rejected the image's Node **22.23.3 → 22.23.4** change. The original failure remains sealed with `originalAttemptComplete: false`; the recovery explicitly binds that Node change to the audited image and retains the remaining environment/security checks. It continued with B Web → A Worker → B Worker, preserved A Web's actual container, and did not submit the fallback StartStack.

The old Workers were observed stopped at **16:02:10.802** and **16:02:27.116 UTC**. The first replacement Worker was observed healthy at **16:16:01.882 UTC**, and the second at **16:16:56.565 UTC**. Background task processing therefore paused for approximately **14 minutes**; the interval from both Workers observed stopped to the first observed healthy is 13m34.766s. These are observation boundaries, not exact transition timings or a claim that the Web service was down for the same duration.

All **34 native operation receipts** were reconciled to `Complete`, `success: true`: **8 preparation + 14 original-attempt + 12 recovery**. This does not turn the interrupted application-level attempt into a straight-line successful release. Fresh empty-lease barriers, preserved A identity, exact image/Node binding, unchanged security/startup controls and formal schema provenance are included in the final acceptance.

## Evidence and remaining scope

[summary.json](summary.json) contains the minimal allowlisted result, observed timestamps and SHA-256 references to the sealed initial-attempt, recovery, postflight, terminal and final-acceptance files in the private `feedback272-275-release/` and `feedback272-275-recovery/` evidence directories. All nine final-acceptance input hashes and its two exact-CI evidence hashes were checked locally. Raw configuration, environments, credentials, conversation content and generated HTML are not copied into this record. The documentation author performed no production requests; document diff checking is the only additional repository check.

Private production case reads for #259/#260/#264 remain pending specific authorization and were not retried. The deployment result does not diagnose those private cases. #275 remains open for the native purpose gap tracked with #280; this document closes no issue. No new browser, real-provider or full isolation/fault matrix is claimed. Existing runtime 3.5.3 observation remains untouched.
