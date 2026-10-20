# #229 immutable-image measurement and acceptance boundary (2026-10-20 UTC)

This is a read-only follow-up to [#229](https://github.com/LingXi-Org/LingxiLoop/issues/229) and merged [PR #230](https://github.com/LingXi-Org/LingxiLoop/pull/230). It measures the already published `ac9069460e99a20fac7f2c3de87c60f2bec66924` server image against its immediate source baseline `535873b941815b41961a44f56e479257cbb71626`. The supplied production index identity is `sha256:6ac0d343039dbcb36607ff07e708134a9f5fbcbe6f1e51c04a8bca16801314ee`. Image config independently reports `LINGXILOOP_COMMIT_SHA=ac9069460e99a20fac7f2c3de87c60f2bec66924`. This evidence is for that exact image, not the coordinator's later combined source candidate.

## Whole-image compressed size

The [machine-readable measurement](oci-compressed-20261020.json) comes from `scripts/measure-oci-manifest.py`. It resolves both immutable OCI indexes, verifies the SHA-256 of the returned index and `linux/amd64` image manifest, excludes the `unknown/unknown` attestation manifest, and sums the registry-declared sizes of every gzip layer. It downloads metadata only, not image layers. The same GHCR repository and `linux/amd64` platform are used on both sides.

| Published source | OCI index digest | Gzip layer bytes | Layers | Image config bytes |
| --- | --- | ---: | ---: | ---: |
| Baseline `535873b9` | `sha256:b191c1ae502a24e864eaf52476d53792b68eb4e47840f0655a52fb677fa1081d` | 207,402,312 | 19 | 12,344 |
| PR #230 `ac906946` | `sha256:6ac0d343039dbcb36607ff07e708134a9f5fbcbe6f1e51c04a8bca16801314ee` | 206,838,733 | 22 | 13,310 |

Observed gzip-layer reduction: **563,579 bytes (0.272%)**. This is the whole `linux/amd64` image's compressed *layer* total, not a 32% image saving, on-disk image size, registry transfer bill, or runtime memory. The OCI index and image manifest/config have separate sizes in the JSON. Five layers, 79,803,125 compressed bytes, have identical digests. Matching non-empty image-config history entries to their manifest layers shows the old single ZCode COPY layer at 838,703 gzip bytes and the four replacement COPY layers at 293,985 bytes in total, a 544,718-byte difference. The SPA dist COPY layers are 36,674,684 and 36,674,695 bytes; the production dependency COPY layers are 72,367,838 and 72,351,741 bytes. OCI builds may also vary with their build inputs and timing, so the whole-image difference is an observation across the two published artifacts, not a controlled build-speed result.

Reproduce with a Docker buildx client and registry read access:

```sh
python3 scripts/measure-oci-manifest.py \
  ghcr.io/lingxi-org/lingxiloop-server@sha256:b191c1ae502a24e864eaf52476d53792b68eb4e47840f0655a52fb677fa1081d \
  ghcr.io/lingxi-org/lingxiloop-server@sha256:6ac0d343039dbcb36607ff07e708134a9f5fbcbe6f1e51c04a8bca16801314ee
```

## Exact-image local inspection and short probes

Before pulling the published image, `df -B1` showed 32,032,604,160 bytes free on the 32 GB overlay. The manifest declared 206,838,733 compressed layer bytes. Only the `ac906946` image was pulled. Docker uses `vfs` here, so its disk consumption is substantially larger than the registry transfer size; the baseline image was **not** pulled. After the image/probes and removal of three empty, test-owned containers left by timed-out attempts, the overlay had about 20 GB free. No pre-existing image, volume, data or backup was removed.

`docker image inspect .Size` reports **593,838,822 bytes** for the current local image's uncompressed layer-size sum. This is not a before/after comparison and is not the size of the merged final filesystem. A no-network Python inventory inside this exact image observed:

| Path | Files | Regular-file content bytes |
| --- | ---: | ---: |
| `/app/server` | 463 | 3,159,277 |
| `/app/src` | 20 | 75,997 |
| `/app/third_party/zcode` | 29 | 1,182,142 |
| `/app/dist` | 1,135 | 60,851,398 |
| `/app/node_modules` | 25,390 | 265,311,683 |

The Web and Worker TS entrypoints, migration entry, complete Visualize skill root, both pinned ZCode Apache notices, SPA `index.html` and streaming-text license exist. No path matching `__tests__`, `__integration__`, `test/`, `tests/`, `fixtures/`, `screenshots/`, `recordings/` or `*.test.ts` was found under the product-owned `/app/server`, `/app/src`, `/app/third_party/zcode` and `/app/dist` regions. This scan does not prove third-party npm packages lack their own test/docs files or exhaustively validate all dynamic runtime resources.

With no production credentials and `--network none`, the image's default Web command and `npm run worker:start` both loaded their real `tsx` entrypoint and exited 1 at `[env] Missing required environment variable: DATABASE_URL`. This is packaging/import evidence, **not** ready Web/Worker or business-path acceptance. The exact product bubblewrap preflight run in the default local Docker security context exited 1 with `No permissions to create new namespace`. No security option, namespace policy or product isolation code was changed. This result describes this local executor, not the production nodes. An initial three-way concurrent probe timed out at 20 seconds during Docker `vfs` startup with no app output; sequential reruns above established the actual results.

## #229 acceptance state

| Requirement | Evidence and remaining gap |
| --- | --- |
| Deletion inventory, justification, alternate coverage, rollback | PR #230 [evidence](../issue-229-runtime-payload/README.md) gives the exact 199 removed final-image paths and self-link records, consumer audit, retained coverage and revert path. Broader repository cleanup candidates have not been proven. |
| Same-condition source/dependency/bundle/image/build/disk measurements | Source COPY files/bytes and deterministic source gzip are measured in PR #230; this follow-up adds complete **compressed OCI layer** totals and current-image regions. Baseline installed dependency size, baseline/current uncompressed layers, matched SPA output content, controlled full build duration and peak disk remain unmeasured. CI publish-job elapsed time is not a controlled Docker-build measurement. |
| Final artifact audit | Exact image regions and named required paths were inspected. No product-owned test/fixture path matched the stated scan. A full transitive runtime-resource and npm-package content audit remains open. |
| Exact final image startup and key-path short test | Entry import succeeds to the missing-DB guard. No configured Web readiness, Worker health, isolated Python run or business HTTP/PG path was executed here. Local default bubblewrap preflight fails; qualification requires an already authorized nonproduction executor with its existing isolation boundary intact. |
| Feature/history/permission/isolation/idempotency/migration regression | [Exact `ac906946` CI](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39375401444) and [release publish workflow](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39381179886) succeeded. Integration recorded 328 pass, 12 existing skips, 0 fail; skipped paths are not executed coverage. This follow-up changes no product runtime, but it cannot certify every historical or production path. |
| Independent review, exact CI, publication, deployment, short-term observation | [PR #230 review](../issue-229-runtime-payload/INDEPENDENT-REVIEW.md) and exact CI exist; the release workflow published this exact source image. The user reports two-node production deployment. This task did not independently query production health, short-term operation, or the coordinator's later combined candidate. #229 is not ready to close on this evidence alone. |

No production service, data, manifest, backup, rollback image or security configuration was changed. No merge, deployment or issue closure is part of this follow-up.
