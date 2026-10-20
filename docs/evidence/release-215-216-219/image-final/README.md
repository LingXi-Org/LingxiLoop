# Final candidate image evidence — published, production held

Product source is `d1075e35e16721979b484c2d9e33eeb56468ce9d`, PR [236](https://github.com/LingXi-Org/LingxiLoop/pull/236). This evidence is committed on a separate documentation branch after the build, so the immutable product source remains unchanged. Runtime is formally published `@lyyzka/lingxios@3.5.8`; all four manifests/locks retain exact version/integrity. [Earlier formal qualification](../formal358/README.md), [runtime publication](../runtime358/) and [PDF qualification](../pdfjs358/README.md) remain separate supporting evidence.

## Immutable artifact and actual verification

| Identity | Value |
| --- | --- |
| Repository | `ghcr.io/lingxi-org/lingxiloop-server` |
| Source tag | `d1075e35e16721979b484c2d9e33eeb56468ce9d` |
| OCI index | `sha256:697d5a3e3d34629e603c120cd068abde3a2add611f583d5444d77a947887bf69` |
| linux/amd64 manifest | `sha256:1c437ff4f2b2f36055fddcf179460963d9f95147406989b48355a0020e4bf862` |
| Config | `sha256:019d5728f0ef708fe9a642eaf1effd2c12699cdb303e2206e11b55e542fb2c4b` |
| Rootfs inventory SHA256 | `3d537b85a17d2dd22790264678a83ce64e147f2f0192f4e2bfda40d666f8c96a` |

[Actual OCI receipt](verified-oci/receipt.json) is `passed:true`, with process exit0. The frozen auditor streamed and verified all22 linux/amd64 layer compressed SHA256/sizes and expanded diff IDs; applied whiteouts; checked the exact commit in config; and produced a merged metadata-only rootfs inventory. No layer/file bodies were saved or extracted. The attestation manifest was not downloaded. The auditor took21.438s; this is an audit duration, not application latency.

All474 formal runtime files and all379 retained PDF.js files match their independently qualified references byte-for-byte. [Source correspondence](verified-source/source-check.json) is independently `passed:true`, exit0:521/521 direct-copy paths match exact Git blobs, including48 sequential migrations and Web, Worker, migration and participantDisplayName entries; zero unknown/missing/mismatched paths. Two generated Visualize files are explicitly `generated_uncompared`; SPA/dependency/OS entries are outside that Git-only comparison. These checks establish artifact correspondence, **not configured image readiness, kernel isolation or production health**.

## Whole-image measurements and limits

| linux/amd64 layer measurement | Historical baseline | Final candidate | Net delta |
| --- | ---: | ---: | ---: |
| Compressed bytes | 206,838,733 | 205,959,232 | −879,501 (−0.425%) |
| Expanded tar bytes | 623,327,232 | 618,504,704 | −4,822,528 (−0.774%) |
| Layer count |22|22|0|

The historical baseline is index `6ac0d343039dbcb36607ff07e708134a9f5fbcbe6f1e51c04a8bca16801314ee`, source `ac9069460e99a20fac7f2c3de87c60f2bec66924`, from [retained evidence](references/historical-baseline.json); it was **not fetched again** in this run. This delta includes runtime, source and SPA changes and cannot be attributed wholly to PDF pruning. The separately verified PDF package reduction is175 files/10,508,615 raw bytes; its package-copy gzip result is not a whole-image measurement.

Merged rootfs has39,204 entries,34,243 regular files and583,749,649 regular-file logical bytes. Three hardlinks add15,234,762 logical bytes but are not double-counted in regular-file totals. Production `node_modules` has25,234 regular files/243,634,898 bytes; SPA `dist` has1,207/66,290,700 bytes. Logical files and expanded tar sizes are not physical disk usage.

[Path-category analysis](analysis/pr236-d107-rootfs-analysis.json) records6,050 dependency source maps/43,257,857 bytes,710 files under test/fixture directories/3,857,308 bytes,64 under docs/example directories/321,510 bytes and481 Markdown files/3,087,136 bytes. Categories overlap and are **not deletion proof**. The limited product-owned path scan found no test/fixture candidates; it is not an exhaustive content audit. [Retention review](analysis/final-image-retention-review.md) maps the actual major entries to consumers or unresolved candidates: Node, GNU canvas/PDF resources, tsx→esbuild, tokenizer/telemetry, Mermaid and static image assets. Musl canvas, maps, package formats and historical asset consumers need separate qualification before removal. The esbuild hardlink is counted once.

**#229 remains open.** This is a bounded, modest reduction; controlled cold/warm builds, peak disk, broader dependency removal and final production acceptance are incomplete.

## CI, publication and retained failures

- Exact d107 [PR CI39412540194](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39412540194): all five components passed;353 integration tests,340 passed,0 failed,13 skipped,418,593.482617ms.
- Exact d107 [publish-only39413726289](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39413726289): success;353 integration tests,340 passed,0 failed,13 skipped,586,820.528891ms;118 server tests and2 selector checks passed. Only the candidate image was published. `deploy`, `update-manifests` and `rollout` all skipped.
- All13 skipped cases are retained individually in [PR outcome](ci/final-pr-ci-outcome.json) and [publication outcome](ci/final-publication-outcome.json). The separately successful live memory/provider qualification does not convert every skip into a pass.
- Earlier source2a1 PR CI39408677903 passed, but its publication39410273533 failed before behavioral assertions with Worker `EADDRINUSE :::52992`; no image was published. The narrow fixture port correction retained all assertions/budgets and proved26 conversation/compaction turns while52992 was continuously occupied. The original CI port occupier is unknown. [Fixture evidence](../../pr236-worker-health-port/README.md) and original failure logs are retained.

[Build observations](analysis/pr236-d107-build-observations-corrected.json) use successful GitHub workflow/job REST receipts: publication job371s, Docker build/push step328s. The root CI installation reported `du -sb node_modules`1,677,764,615 bytes including development dependencies; this is not final production dependency size or peak disk. Publication raw-log reads first returned empty output despite CLI exit0; the empty-log cache inference was rejected and is preserved under [superseded analysis](analysis/superseded/README.md). A direct job-log download then returned `Forbidden`; further attempts stopped. The [denied read receipt](ci/pr236-d107-publish-log-access.json) contains only the public job target/status, with no signed redirect. Cached step count is null/unverified. Configured cache-from/cache-to is not a controlled cold/warm comparison.

The first local buildx inspection attempted its default read-only home state path; using an owned temporary `BUILDX_CONFIG` directory resolved that local state problem without copying credentials. One concurrent CI log read returned an invalid zip; the integration log was later obtained sequentially. [Resolved read attempts](ci/resolved-read-attempts.json) preserve those outcomes. No ambiguous mutation was retried.

## Review and reproducibility

- Frozen [OCI auditor](auditor/audit.py) SHA256 `2507419a202bec96f4566a1c2bd62c584a128d52f8cb81d913ac6f56ae7aaf6f`:22 offline tests; initial failures and two independent-review P2 corrections retained. Actual run was performed only after corrections/review.
- [Source checker](source-checker/check.py) SHA256 `4420a376bc0a758302b1a13ad08fdee6033de28a80c103a05ea5635363b63486`:9 offline tests, coordinator source/policy review and actual521-path comparison.
- [Actual independent review](actual-independent-review.md) rechecks identities, hashes, layer/rootfs arithmetic, formal package files, source correspondence and the limits of the claims. [Dependency reviewer check](analysis/final-image-retention-independent-check.json) independently rechecks actual inventory and package contents.
- `SHA256SUMS` covers every archived file except itself. Scripts document bounded reads and repeatable command forms. Logs are synthetic test or public CI evidence; credential-shaped literals and signed-storage URLs were checked before committing, without claiming exhaustive secret detection. No real memory bodies or credentials were added.

## Exact remaining production hold

The parent coordinator is awaiting maintenance downtime confirmation. **No main/production branch update, production pin change, stop, backup, migration or rollout was performed for this candidate.** The retained baseline receipt describes runtime3.5.6/native12/product46; it is historical, not a fresh production probe.

The pending operation must stop both Web/API instances and both Workers, verify a real production backup and isolated restore plus an empty writer/lease barrier, then apply47/native13→48 and start compatible services with actual readiness/Worker/HTTPS/Komodo success receipts. Once47 commits,3.5.6 must never restart;48 failure requires compatible fix-forward. The local23-second migration rehearsal is not a production downtime estimate. Production backup/restore, drain, migration/start receipts, exact-image runtime isolation/readiness and short production observation remain absent. The fixed paused3.5.3 soak is untouched. Production actions are **pending authorization confirmation**, not denied or of uncertain outcome; no production write was attempted here.
