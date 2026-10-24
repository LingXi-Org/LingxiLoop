# Runtime 3.8.11 qualification

## Frozen candidates

- Runtime development source: `18f7509da546d485b55fba33301f88567b19d28d`.
- Upstream merged source: `4ef5ebad7ad2c22c752394763b09b987842be9f0`; its complete Git tree is identical to the qualified development source.
- Product source before the formal package pin: `c1b23c8331f95432d7c7733ae4f3d7c8f9ebb4c0`.
- Development package SHA256: `c3bf804705aeed4d735c867b3b969826b11eaf4bd9fdff4fcab037363a454b33`; all 533 installed package files were checked against the frozen build.
- Exact upstream PR CI: [40051209313](https://github.com/LingXi-Org/LingxiOS/actions/runs/40051209313), successful.

This record describes isolated synthetic-task qualification with the configured real model and the actual product browser/resource path. It is not an acceptance result for a private production conversation. Formal publication, dependency pin and production rollout have separate records.

## Actual behavior

| Scenario | Generation calls | Protocol corrections | Generic reviews | First useful durable text | Final commit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Explain supplied facts, then create an interactive two-stage diagram | 4 | 0 | 0 | 7.814 s | 20.624 s |
| A new arithmetic request in the same conversation | 1 | 0 | 0 | 2.274 s | 2.965 s |

The explanation source sealed at 9.714 s and remained in the final answer. Diagram authoring started at 15.926 s; its one save completed at 16.121 s. Storage readback matched the source hash and version. The official browser engine used the real product message renderer and resource API and verified the visible transition Gather → Check → Gather with the requested descriptions. Tail from the last retained text delta to final commit was 0.881 s.

The subsequent arithmetic answer was `43`, with zero tool or retrieval calls, no general semantic review, verified final source hashes and unchanged earlier graph receipts. Its corresponding tail was 0.692 s. These measurements use durable server event timestamps, not browser first-paint timing.

## Independent review and boundaries

Source and complete serialized-request reviews found no blocking P1/P2. A scripted four-request Worker audit separately verified schema identity, one current output contract, the conditional stage, native call/ack recovery and final retained sources. Actual provider responses were not replaced by these scripted results.

The full-context semantic review accepted the English factual explanation and the completed interactive delivery. An initial wording concern was reassessed: introduction of the diagram within an in-progress answer did not claim it was already saved, independently verified or immediately accessible. The final delivered behavior matched that introduction. The original review and original runtime receipts remain preserved; the supplementary review records the correction rather than rewriting them. A final explanatory caveat was considered unnecessary wording, not a material factual error.

The stage is conditional on an explicit workflow declaration tied to the current human request. Literal source references establish provenance, not semantic truth. The runtime records an explanation as provided, never as semantically verified. This case does not prove that every natural-language request triggers the stage, that every task uses one generation, or that resources are usable before their save and delivery checks finish.

The configured provider uses explicit `auto` tool choice. An earlier `required` candidate returned unusable empty native-call responses in both scenarios and remains failed; there is no runtime fallback or provider switch. Previous candidate failures are retained. A necessary bounded protocol correction is reported as a real call and cost; it is not a generic reviewer and is not hidden to improve the one-generation metric.

## Local and CI evidence

The final auto-policy delta passed 62 distinct focused checks across recorded runs, including legal JSON field order, operation-before-text publication, request/estimate agreement, legacy/private profile isolation and correction-contract wording. Independent review passed.

An earlier isolated full suite at `fa8a70f` ran 1192 checks: 1186 passed and six failed. Three obsolete prompt-literal assertions were corrected and retested in the final candidate. One package-consumer check was blocked by a missing offline `zod` cache artifact. Two auxiliary streaming cases failed around short fixture deadlines; a single diagnostic run also exhibited timing-sensitive failures. Those local results remain failed and are not represented as green. The final candidate's complete required upstream CI passed.

Native schema remains 14. The product rollout must preserve product schema 54, verify complete inventories and frozen configuration, drain incompatible bound runs, upgrade Web readers before Worker writers and register provenance without replaying database migrations.

## Formal package identity

Formal [publication 40053369381](https://github.com/LingXi-Org/LingxiOS/actions/runs/40053369381) succeeded for `v3.8.11`. Registry `gitHead` is exactly `4ef5ebad7ad2c22c752394763b09b987842be9f0`; the merged-main [CI 40052282970](https://github.com/LingXi-Org/LingxiOS/actions/runs/40052282970) also succeeded at that commit.

The downloaded official archive has SHA256 `9835fcfe90694e495194079353d3d8ed2665c4d771af858cd896200b2f4b69bd` and integrity `sha512-LgZSHolbT7T3zVB1cQ8OdFcwP7rjTTX58HhlZKaDPbo+mW3WK/H46stTrlpzimtukq9YLgvIMNZH56tTLZ08Vg==`. All 533 regular package files are byte-for-byte identical to the qualified development package, with no normalization or exceptions. Root and server declarations and locks pin this same official version, URL and integrity. This identity comparison carries the recorded behavior qualification to the formal package without another provider run.

## Product integration fixture follow-up

The first formal-package product candidate, `8fc4f61cc3fa38a7ff7a1c9470cba174b0fe6e6d`, passed its five component check groups but failed integration in [CI 40054633546](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40054633546). Its job-log download was denied; no alternate download route was used. Independent local reproduction established obsolete test fixtures, rather than claiming access to the remote failing assertions.

The test-only follow-up sends production-profile replies through the actual native `public_answer` channel, preserves the legacy localhost profile, verifies the reviewed Web skill separately from immutable vendor bytes, and parses the candidate and current-request anchor as separate strictly bound records. Existing usage, bounded retry, cancellation, source identity, private-data exclusion, single-save and complete-delivery assertions remain. The selected-workflow test reports an existing driver error before waiting for delivery; its original deadline and six scenarios are unchanged.

All 35 owning checks across six recorded runs passed after fixture alignment or isolated diagnosis. The initial local parallel run also encountered a missing visual-resource prebuild and timing failures; the resource was built using the existing CI step, and the original latency, selected-workflow and 26-turn context checks then passed without larger timeouts or weaker assertions. Those original failures and logs remain recorded. The isolated context case completed 26 delivered turns and reached compaction epoch 25. This is synthetic compatibility coverage, with no production model requests and no change to the qualified runtime, production generation guidance or behavior.
