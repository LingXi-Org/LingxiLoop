# Independent review — actual d107 candidate image

Conclusion: no remaining P1/P2 found in the reviewed artifact identity, source correspondence, size arithmetic or corrected evidence claims. This is a local read-only review of retained receipts and objects, not another registry audit or application test. The empty publication-log cache inference is superseded and is not accepted as evidence.

## Exact artifact and independent checks

- Product source: `d1075e35e16721979b484c2d9e33eeb56468ce9d`.
- Successful publication run: `39413726289`; job: `118601974850`.
- Repository: `ghcr.io/lingxi-org/lingxiloop-server`.
- Index: `sha256:697d5a3e3d34629e603c120cd068abde3a2add611f583d5444d77a947887bf69`.
- linux/amd64 manifest: `sha256:1c437ff4f2b2f36055fddcf179460963d9f95147406989b48355a0020e4bf862`.
- Config: `sha256:019d5728f0ef708fe9a642eaf1effd2c12699cdb303e2206e11b55e542fb2c4b`.

I recomputed the saved index digest, selected amd64 descriptor, receipt/inventory/input hashes, all 22 layer sums, merged inventory counts and category totals. Every present ancestor of every inventory path is a directory. The supplied actual auditor/source-checker runs report exit 0 and `passed:true`; retained audit stdout agrees. I did not rerun those network operations or independently download layer bodies. Their frozen implementations were inspected in the preceding tool reviews.

I independently read the local formal runtime tar without extracting it and compared all 474 regular package files against the image inventory by path, SHA256 and size. All 379 retained PDF.js reference files also match. I used `git --no-replace-objects` against exact d107 objects to recompute the source correspondence: 521/521 image paths, 519 unique Git paths, zero issues, including all 48 sequential migrations and the four critical entries. The reference tar, reference inventory and direct-copy policy hashes match the receipts.

The 521-path claim is confined to the reviewed direct-copy scopes. Two generated Visualize files remain `generated_uncompared`; SPA, other dependencies and OS files are outside Git correspondence scope. Package matching and source matching do not establish configured runtime behavior.

## Recomputed volume

| Measurement | Historical baseline | Final image | Delta |
| --- | ---: | ---: | ---: |
| Compressed layer bytes | 206,838,733 | 205,959,232 | −879,501 (−0.425211%) |
| Expanded tar bytes | 623,327,232 | 618,504,704 | −4,822,528 (−0.773675%) |
| Layer count | 22 | 22 | 0 |

The retained baseline identifies source `ac9069460e99a20fac7f2c3de87c60f2bec66924`, index `sha256:6ac0d343039dbcb36607ff07e708134a9f5fbcbe6f1e51c04a8bca16801314ee`; its artifact hash was checked, but it was not fetched or remeasured. This is a whole-image historical comparison, not a controlled PDF-only or cold/warm comparison.

Merged inventory independently totals 39,204 entries: 4,097 directories, 34,243 regular files, 3 hardlinks and 861 symlinks. Regular-file logical bytes are 583,749,649; hardlink targets contribute 15,234,762 additional logical bytes if counted per path. These are not physical disk measurements. Dependency and SPA regions and all four overlapping path categories reproduce the analysis; category counts are neither additive nor proof that files can be removed. The limited product-owned scan is not exhaustive.

## Corrected build observations and explicit gap

The corrected JSON and analysis script agree with every input hash. Successful workflow/job REST records bind the exact source and show publication-job duration 371 seconds and build/push-step duration 328 seconds. The saved server-check log contains one `du -sb node_modules` observation of 1,677,764,615 bytes; that is a root CI installation including development dependencies, not production dependency size or peak disk usage.

Raw publication log retrieval for run `39413726289`, job `118601974850`, was **denied** by redirected log storage (`Forbidden`). Earlier CLI exit 0 with an empty file provided no cache evidence. The coordinator stopped retries; I made no retrieval attempts. The redacted denial sidecar is bound to the exact job/source. Cached step IDs/count are correctly `null`, cache reuse is unverified, and controlled cold/warm builds and peak disk remain unmeasured. The old empty-log result remains only as superseded evidence. The corrected script rejects an empty log without a matching denial sidecar; it does not turn this denial into zero cache hits or build success.

## Hashes of reviewed final inputs

| Artifact | SHA256 |
| --- | --- |
| Frozen OCI auditor | `2507419a202bec96f4566a1c2bd62c584a128d52f8cb81d913ac6f56ae7aaf6f` |
| Frozen source checker | `4420a376bc0a758302b1a13ad08fdee6033de28a80c103a05ea5635363b63486` |
| Actual OCI receipt | `c78239a71b4d76f046a345413c40cda46738fe182add06abf5e0cef5e4a8e013` |
| Rootfs inventory | `3d537b85a17d2dd22790264678a83ce64e147f2f0192f4e2bfda40d666f8c96a` |
| Source correspondence receipt | `2b956a413a0d49fe9304c397559350ab2cf5a80d46a986c870db5ba804ca8364` |
| Rootfs analysis | `a2fb0ae6a1488c857072093fb157f5c8f47fd4db67a529b4bf8c0bfb822e93ca` |
| Corrected build observations | `c214e9ac11d2df0105a6a7f7974b0c0f334e61fe9bd24deeb7b1da6d0582419d` |
| Corrected build analysis script | `4149ead6d437863f9df261c87d3ceb68e144521296c3bea1551779ff4879e21d` |
| Redacted log-access receipt | `1984f99b03393433b74aa1ef01038ef0df9c29305f12dd6b9a557075d79dfdfe` |

I also read the final evidence README and compared its relevant identity, counts, timing and scope statements to these records. The archived corrected build JSON and denial receipt are byte-identical to the reviewed private originals. This review does not certify a subsequent documentation commit or its final manifest before it exists.

## Remaining limits and production hold

Image-backed configured readiness, runtime/kernel isolation and production health remain untested here. The attestation manifest was not downloaded. Retained CI outcomes keep 13 skipped cases as skipped; this review did not rerun or promote them. Workflow `deploy`, `update-manifests` and `rollout` are all skipped. No production access, backup, migration, rollout, provider call, credential operation or layer download was performed by this review; local file reads and in-memory/hash arithmetic only, with this report as its sole deliverable write.

Production maintenance authorization confirmation and actual backup/drain/migration/start/health receipts remain pending, not completed or of uncertain outcome. The publication-log read is the separate denied action described above; it does not invalidate the independently checked artifact correspondence. The paused 3.5.3 soak was untouched.
