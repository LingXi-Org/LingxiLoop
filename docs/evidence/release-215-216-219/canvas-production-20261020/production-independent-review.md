# PR239 production evidence independent reconciliation

**PASS.** The frozen verifier recomputed the recorded acceptance exactly: 16/16 checks true. Independent identity, order, count, schema, public-byte, and caller-delta checks also passed. There are no remaining P1/P2 findings in this reviewed scope.

Reviewer: /root/maintenance_resume_review. Reviewed at 2026-10-20T15:48:37.675Z. This review read local evidence only and made no production or network calls. It did not edit frozen application or release files.

## Release and observation window

- Source: d1075e35e16721979b484c2d9e33eeb56468ce9d
- Target: 9a5cfda82ad105d666bf0452df1d615daf6c6a28
- Plan: 78166e8cb841bd5735c25ea3eac9fef1be4e4846709ec8a55a10c7445f8bbf8a
- Release complete: 2026-10-20T15:43:55.586Z
- Container/public postflight: 2026-10-20T15:44:22.359Z through 2026-10-20T15:44:37.887Z
- Native receipt collection: 2026-10-20T15:44:24.244Z through 2026-10-20T15:44:38.372Z
- Original final acceptance: 2026-10-20T15:45:47.705Z
- Final acceptance SHA256: c67b628c068bcdee245e086947ee876b982957d12290b6da52e10853e819d85d

Recomputation used the recorded acceptance timestamp, then compared the entire result, including all input hashes and limitations. It does not renew the freshness of those observations. All raw inputs were rehashed at the end of this review and remained unchanged.

## Actual host image identities

Both hosts report the source daemon image ID sha256:697d5a3e3d34629e603c120cd068abde3a2add611f583d5444d77a947887bf69 and target daemon image ID sha256:9c6753001d1561db46c45a00e6cbdfa2fceae304454f7da3c84c4e981ffb1b08. These are observations from InspectImage/container evidence, not IDs inferred from the OCI config. The target OCI config digest is separately sha256:80c5e5ce9f7c0b20b06ae3ec9c0512bc2f8976572f7cab81a6de4c1f45c5fa6a. Both target hosts match linux/amd64, exact audited RepoDigest/descriptor, and all 22 ordered rootfs diff IDs.

| Host | Source daemon Image.Id | Target daemon Image.Id |
| --- | --- | --- |
| shanghai-a | sha256:697d5a3e3d34629e603c120cd068abde3a2add611f583d5444d77a947887bf69 | sha256:9c6753001d1561db46c45a00e6cbdfa2fceae304454f7da3c84c4e981ffb1b08 |
| shanghai-b | sha256:697d5a3e3d34629e603c120cd068abde3a2add611f583d5444d77a947887bf69 | sha256:9c6753001d1561db46c45a00e6cbdfa2fceae304454f7da3c84c4e981ffb1b08 |

## Four current containers

All four exact deployed IDs match both the completed release and postflight. Each is healthy/running, with restartCount 0, OOM false, and unchanged security policy relative to the accepted source. The JSON companion records the original IDs, start and health times, and image bindings.

| Stack/service | Target container ID |
| --- | --- |
| lingxiloop-app-a/lingxiloop | e70de555750c34f786d91bd26f9e74bee3c4816c00bbf9d29ca5a27725844bfb |
| lingxiloop-app-a/worker | a27c736d258293d0ade0595e78fd1668f13df59aaa44f1b447253b46c8d40b2a |
| lingxiloop-app-b/lingxiloop | 52b8a51e126ebf900b763cbe22711b85bb931e35a08c8c8a8ea81cd11b91061c |
| lingxiloop-app-b/worker | 7aaa9cf9ef24976ccfde3d75e14135c811266b474a005cb1029da0096f07c98c |

## Native schema, operations and probes

Runtime remains 3.5.8, native schema/installed schema 13, protocol 11, product migration inventory 48/48. Every one of 18 SQL state receipts matches the full source and target inventory including checksums; source and target formal schema are equal. No schema migration is part of this release. Final state is native update 6ad78c37e06d5e1f798372c2.

Exactly 36 unique updates are Complete/success:true, bound to their input bytes, expected request/native operation, stack/service and Stack target ID: preparation 8, release 28. Native operation counts are 22 RunStackService (18 state, 2 metadata, 2 public-fixture probes), 6 WriteStackContents, 2 PullStackService, 2 StopStackService and 4 DeployStackService. The two old Workers stopped before rollout; zero-lease barriers are recorded. Healthy rollout order was Web A, Web B, Worker A, Worker B. Both metadata and both native probes finished before the first Worker stop.

| Host | PNG/PDF native update | PNG bytes | PDF bytes | Elapsed ms |
| --- | --- | --- | --- | --- |
| shanghai-a | 6ad78af0e06d5e1f79837268 | 115 | 201 | 1884 |
| shanghai-b | 6ad78b09e06d5e1f79837270 | 115 | 201 | 1958 |

Both probes passed linux/x64/glibc selection, GNU canvas selected and musl absent, with exact expected public-fixture output: PNG SHA256 37bb849c8331759b4b7b6ec3e959f1e60b4b5bfbf9dcd4a4b711ae0c406ca5c0, PDF SHA256 30ee46cdb0878604ece1e00fab7a9807f3db64ff443a48e6dc2fe4a5646a5e04. They used the public fixture, not authenticated user documents. The audited image removes only the listed musl binary (30,315,608 regular-file bytes); retained canvas entries match the target inventory.

## Public evidence and limits

Four public endpoints returned 200: /api/health, /readyz, /api/health/dependencies, /api/meta. The sampled meta reports the exact target and native runtime/schema/protocol; recorded database/Redis/OpenNotebook dependency checks are true. The three public asset samples below match the decoded byte count and SHA256 of the exact audited image inventory.

| Asset | Decoded bytes | SHA256 |
| --- | --- | --- |
| / | 1697 | b19dfd9101c468e4129a2e4949bc9c8477e6b3066a36de18730c7a48a9e817df |
| /assets/index-C2BGquub.js | 200192 | 3b4d3b25b68c9618ed1b5c191176cc0633b9c8ebeb8cbbb8dc2e0815e9ad3cd1 |
| /assets/index-D6e91Zk4.css | 451080 | 854075030c6db6d83c3831cc43f89912e31f86ff5f584cc74b055cf1fcd4c47e |

- Offline reconciliation of recorded production observations, not a new live liveness check. Freshness was recomputed at the exact original acceptance timestamp; this report does not extend that observation window.
- Public evidence is four health/version endpoint requests and three decoded asset samples: HTML, entry JS, entry CSS. It does not prove every CDN location, every chunk or continuously available traffic.
- Authenticated business smoke was not run; no existing authorized identity was injected and no credential was created or copied.
- Worker isolation is inferred from the exact shipped entrypoint and native readyz/startup checks; no full production fault-injection or isolation matrix was run.
- PNG/PDF checks used the fixed public fixture on both hosts before drain. They do not prove arbitrary document/provider inputs.
- The pending remote maintenance reindex-progress/script/schema/approval delta is outside this release acceptance and caller pending-marker review.

## Caller terminal-readback delta

Accepted. Caller SHA256: e846c36d6d52213dbe2a3c9cebb6a4aca55e3c723693c8df8a54c27556bcd592. The new pending marker is persisted before the fresh GetUpdate, remains true on transport/identity/aggregate failure, and clears only after exact terminal and safe aggregate equality. Catch merges the pending marker into uncertainty. Local classification checks passed for pending+complete (uncertain), cleared+complete (known), and cleared+application-unknown (uncertain); static ordering confirms persistence precedes readback. This adds no new execute operation and preserves the earlier evidence-first behavior. Remote reindex-progress/schema/approval changes are a separate pending scope.

## Evidence binding

The JSON companion contains all 36 exact terminal identities, current/source container and image IDs, native probe summaries, all input hashes, verifier/check details and explicit limits. Companion SHA256: 484e1bc6a1ad4a4ee89d6cf9e11ed5c953ecfcab863336f665e3f57f25a91995.

Frozen verifier SHA256: e80eb3cd33295954b9c9a22053c7312e43e44f2145ffe819506e5ded34897e69. Frozen collector SHA256: 0a2f0754f4ef31f410a3d7089753a551cba27934d0345c0628ba88a10376eacc.
