# #229 immutable-image measurement and acceptance boundary (2026-10-20 UTC)

This is a read-only follow-up to [#229](https://github.com/LingXi-Org/LingxiLoop/issues/229) and merged [PR #230](https://github.com/LingXi-Org/LingxiLoop/pull/230). It measures the already published `ac9069460e99a20fac7f2c3de87c60f2bec66924` server image against its immediate source baseline `535873b941815b41961a44f56e479257cbb71626`. The supplied production index identity is `sha256:6ac0d343039dbcb36607ff07e708134a9f5fbcbe6f1e51c04a8bca16801314ee`. Image config independently reports `LINGXILOOP_COMMIT_SHA=ac9069460e99a20fac7f2c3de87c60f2bec66924`. This evidence is for that exact image, not the coordinator's later combined source candidate.

## Whole-image compressed and expanded layer sizes

The [machine-readable measurement](oci-layers-20261020.json) comes from `scripts/measure-oci-manifest.py`. It resolves both immutable OCI indexes, verifies the SHA-256 of the returned index and `linux/amd64` image manifest, excludes the `unknown/unknown` attestation manifest, and sums the registry-declared sizes of every gzip layer. With `--stream-uncompressed`, it streams each distinct gzip blob once, verifies its SHA-256 and declared compressed length, and counts the decompressed tar bytes. No layer is stored or extracted. The same GHCR repository and `linux/amd64` platform are used on both sides. Unique compressed blob transfer was 334,437,920 bytes; shared blobs were fetched only once.

| Published source | OCI index digest | Gzip layer bytes | Expanded tar layer bytes | Layers |
| --- | --- | ---: | ---: | ---: |
| Baseline `535873b9` | `sha256:b191c1ae502a24e864eaf52476d53792b68eb4e47840f0655a52fb677fa1081d` | 207,402,312 | 625,566,208 | 19 |
| PR #230 `ac906946` | `sha256:6ac0d343039dbcb36607ff07e708134a9f5fbcbe6f1e51c04a8bca16801314ee` | 206,838,733 | 623,327,232 | 22 |

Observed gzip-layer reduction: **563,579 bytes (0.272%)**. Observed expanded tar-layer reduction: **2,238,976 bytes (0.358%)**. These are whole `linux/amd64` image *layer* totals, not a 32% image saving, the deduplicated merged filesystem size, on-disk Docker `vfs` use, registry transfer bill, or runtime memory. Tar headers and padding count in expanded layer bytes. The OCI index and image manifest/config have separate sizes in the JSON. Five layers, 79,803,125 compressed bytes, have identical digests. Matching non-empty image-config history entries to their manifest layers shows the old single ZCode COPY layer at 838,703 gzip / 3,446,272 tar bytes and the four replacement COPY layers at 293,985 gzip / 1,224,192 tar bytes in total. The SPA dist COPY layers are 36,674,684 and 36,674,695 gzip bytes; the production dependency COPY layers are 72,367,838 and 72,351,741 gzip bytes. OCI builds may also vary with their build inputs and timing, so the whole-image difference is an observation across the two published artifacts, not a controlled build-speed result.

Reproduce with a Docker buildx client and registry read access:

```sh
python3 scripts/measure-oci-manifest.py --stream-uncompressed \
  ghcr.io/lingxi-org/lingxiloop-server@sha256:b191c1ae502a24e864eaf52476d53792b68eb4e47840f0655a52fb677fa1081d \
  ghcr.io/lingxi-org/lingxiloop-server@sha256:6ac0d343039dbcb36607ff07e708134a9f5fbcbe6f1e51c04a8bca16801314ee
```

## Complete SPA and production dependency layers

The baseline/current SPA `COPY /app/dist ./dist` layers are identified by matching non-empty OCI config history to layer descriptors. [`dist-assets-20261020.json`](dist-assets-20261020.json) records complete file-inventory hashes, category counts and per-file compression totals from the two digest-verified published layers. Gzip is per-file level 9 with fixed mtime; Brotli is per-file quality 11. These are totals of individually encoded assets, **not** the compressed OCI tar layer or actual HTTP transfer under a particular server configuration.

| Dist layer | Files | Raw bytes | Per-file gzip bytes | Per-file Brotli bytes | Content changes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 1,134 | 60,850,325 | 37,282,434 | 35,408,899 | 0 |
| PR #230 | 1,134 | 60,850,325 | 37,282,434 | 35,408,899 | 0 |

Both complete path/size/SHA-256 inventories hash to `28b0f298d5b9280c057aa21deb3f70b085e637b5fcf1a0cfa89522636bd47e1c`. The 11-byte difference between compressed dist COPY layers is tar/build metadata, not an asset-content saving. The final image also separately adds the streaming-text license at `/app/dist/licenses/assistant-ui-streaming-text.txt`, so its merged `/app/dist` inventory has 1,135 files.

[`dependency-layer-20261020.json`](dependency-layer-20261020.json) inventories every entry in the baseline/current production `COPY /app/node_modules` layers, including regular files, directories and links. The former has 25,376 regular files / 253,889,424 content bytes; the latter has the same 25,376 regular files / 253,883,731 content bytes. The only changed paths are `app/node_modules/.package-lock.json` and the removed `app/node_modules/lingxiloop` symlink. Other dependency files retain the same path, size and SHA-256. This is a 5,693-byte regular-content decrease plus one symlink, not removal of the frontend dependency tree. Tar padding and compressed layer sizes are recorded separately in the JSON.

Reproduce the fixed-layer inspections with Node 22+ and Python 3:

```sh
node scripts/measure-oci-dist.mjs ghcr.io/lingxi-org/lingxiloop-server \
  sha256:8d76433a7650790d61d1f4ef03831a5d02cf51774f6f0eabdfa46395e4a27a88 \
  sha256:71aaedf3689722e06c7c08f5d178a78e0ffa826b538ac89a533f49fece166925
python3 scripts/measure-oci-layer-files.py ghcr.io/lingxi-org/lingxiloop-server \
  sha256:c3c5e97a426c13b4a1d9b36e1464786715ec885ff0a98ff134619e2fd7d572f8 \
  sha256:bcc0974a5940129ca035472f1de49bd856703019a258dcc092b57f21136c8e26
```

## Exact-image local inspection and short probes

Before pulling the published image, `df -B1` showed 32,032,604,160 bytes free on the 32 GB overlay. The manifest declared 206,838,733 compressed layer bytes. Only the `ac906946` image was pulled into Docker; the baseline blobs were streamed into memory for byte counting, without creating a Docker image. Docker uses `vfs` here, so its disk consumption is substantially larger than the registry transfer size. After the image/probes and removal of three empty, test-owned containers left by timed-out attempts, the overlay had about 20 GB free. No pre-existing image, volume, data or backup was removed.

`docker image inspect .Size` reports **593,838,822 bytes** for the current local image's Docker-reported size. It uses a different accounting convention from the streamed tar byte total above and is not a before/after comparison. A no-network Python inventory inside this exact image observed:

| Path | Files | Regular-file content bytes |
| --- | ---: | ---: |
| `/app/server` | 463 | 3,159,277 |
| `/app/src` | 20 | 75,997 |
| `/app/third_party/zcode` | 29 | 1,182,142 |
| `/app/dist` | 1,135 | 60,851,398 |
| `/app/node_modules` | 25,390 | 265,311,683 |

The Web and Worker TS entrypoints, migration entry, complete Visualize skill root, both pinned ZCode Apache notices, SPA `index.html` and streaming-text license exist. No path matching `__tests__`, `__integration__`, `test/`, `tests/`, `fixtures/`, `screenshots/`, `recordings/` or `*.test.ts` was found under the product-owned `/app/server`, `/app/src`, `/app/third_party/zcode` and `/app/dist` regions. This scan does not prove third-party npm packages lack their own test/docs files or exhaustively validate all dynamic runtime resources.

With no production credentials and `--network none`, the image's default Web command, `npm run worker:start` and `npm run db:migrate` each loaded their real `tsx` entrypoint and exited 1 at `[env] Missing required environment variable: DATABASE_URL`. The image's actual Python Visualize calendar exporter succeeded: 918,950 output bytes, SHA-256 `5f8dc7484e867a8ca7c8a050478e73a46918bf83e53c1114866bc79700f5c91c`. Its generated `server/assets/visualize-runtime/gen-ui.js` hash was `78dfe495e3a5398a0cbc4123ccc23631dc203ac9da51b4bfd915879513e36494`, matching prior source-payload evidence. These are packaging/import and one resource-path checks, **not** ready Web/Worker, migration execution or business-path acceptance. The exact product bubblewrap preflight run in the default local Docker security context exited 1 with `No permissions to create new namespace`. No security option, namespace policy or product isolation code was changed. This result describes this local executor, not the production nodes. An initial three-way concurrent probe timed out at 20 seconds during Docker `vfs` startup with no app output; sequential reruns above established the actual results.

## #229 acceptance state

| Requirement | Evidence and remaining gap |
| --- | --- |
| Deletion inventory, justification, alternate coverage, rollback | PR #230 [evidence](../issue-229-runtime-payload/README.md) gives the exact 199 removed final-image paths and self-link records, consumer audit, retained coverage and revert path. Broader repository cleanup candidates have not been proven. |
| Same-condition source/dependency/bundle/image/build/disk measurements | Source COPY files/bytes and deterministic source gzip are measured in PR #230; this follow-up adds complete **compressed and expanded OCI layer** totals, complete published `dist` file/gzip/Brotli and production dependency-layer inventories, and current-image regions. Controlled full cold/warm build duration and peak disk remain unmeasured. CI publish-job elapsed time is not a controlled Docker-build measurement. The Docker `vfs` pull of just the current image occupied roughly 11 GB, so this task did not launch two full cached/uncached image builds in the 32 GB overlay. |
| Final artifact audit | Exact image regions and named required paths were inspected. No product-owned test/fixture path matched the stated scan. A full transitive runtime-resource and npm-package content audit remains open. |
| Exact final image startup and key-path short test | Web, Worker and migration entry imports succeed to the missing-DB guard; actual-image Visualize Python export and generated bundle hash pass. No configured Web readiness, Worker health, isolated model Python run, migration execution or business HTTP/PG path was executed here. Local default bubblewrap preflight fails; qualification requires an already authorized nonproduction executor with its existing isolation boundary intact. |
| Feature/history/permission/isolation/idempotency/migration regression | [Exact `ac906946` CI](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39375401444) and [release publish workflow](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39381179886) succeeded. Integration recorded 328 pass, 12 existing skips, 0 fail; skipped paths are not executed coverage. This follow-up changes no product runtime, but it cannot certify every historical or production path. |
| Independent review, exact CI, publication, deployment, short-term observation | [PR #230 review](../issue-229-runtime-payload/INDEPENDENT-REVIEW.md) and exact CI exist; the release workflow published this exact source image. The user reports two-node production deployment. This task did not independently query production health, short-term operation, or the coordinator's later combined candidate. #229 is not ready to close on this evidence alone. |

No production service, data, manifest, backup, rollback image or security configuration was changed. No merge, deployment or issue closure is part of this follow-up.
