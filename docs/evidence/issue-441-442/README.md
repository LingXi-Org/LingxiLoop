# Dependency isolation delivery: #441 / #442

Scope: OfficeParser production payload and Web/CI install boundaries. Baseline
`9e3bfd892fa53f22dddbc00e98f466c21ce01b7d`; implementation tree
`595127ab4c065df5c96948a8e97aa7de6625ea1c`, published as
`c0c6934facdf20b6c797b4ab1f10d52c98bb3af8` in draft PR #458. No production,
merge, issue-close, dockerignore or Notebook changes. Independent review was
omitted as explicitly requested. Root/server original dependency locks are
unchanged; the component locks are exact closures of the root lock.

## Exact-commit CI

[Run 40165309054](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40165309054)
passed on `c0c6934facdf20b6c797b4ab1f10d52c98bb3af8`: Web, admin, control,
server, deploy-contract and database-backed integration. This includes the new
OfficeParser before/after smoke and existing authorization/material checks.
Web passed 127 tests, server 140 selected tests plus eight selector tests and
11 PPTX tests on each side of pruning; control passed 13 tests.

One Linux x64 / Node 22 runner observation per job (2026-10-25). `du -sb`
measures installation/cache directories; GHA transfer is setup-node's npm cache,
not the Docker BuildKit cache or a production image. Cache hits differed; these
samples do not establish speedup percentages or warm/cold performance claims.

| Job | Physical packages | node_modules bytes | npm cache bytes | npm install seconds | GHA cache transfer |
| --- | ---: | ---: | ---: | ---: | --- |
| Web | 975 | 1,115,564,868 | 315,848,584 | 41 | export 286,389,891 bytes |
| Server | 644 | 671,821,823 | 206,772,242 | 14 | restore 197,004,691 bytes |
| Deploy-contract | 85 | 223,788,175 | 67,614,341 | 6 | export 64,953,418 bytes |
| Admin | 990 | 1,128,083,409 | 318,843,823 | 27 | restore 288,847,259 bytes |
| Control | 274 | 742,227,189 | 254,599,000 | 19 | export 226,286,735 bytes |
| Integration | 659 | not recorded | not recorded | 17 | export 200,950,467 bytes |

Web Vite build: 42.55s; Admin: 8.56s. The baseline issue's same-platform full
root install observation was 1,842,234,418 bytes in deploy-contract
([job 120946821156](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40119177108/job/120946821156)).
The new deploy-contract directory is 223,788,175 bytes; other job scopes are
listed separately. No comparable baseline npm-cache export sample was available.
The historical 883.53 MB Docker builder cache blob is a different cache product.

## Production dependency layer comparison

Same Linux/amd64, Node 22.23.4, npm 10.9.9 and base image
`accel.way2api.fun/docker.io/library/node@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d`.
Both installs use the unchanged server lock and the already verified original
npm tarballs offline. Existing top-level PDF.js and glibc Canvas pruning runs
on both sides. Only the candidate applies the OfficeParser trim.

| Metric | Baseline | Candidate | Reduction |
| --- | ---: | ---: | ---: |
| production node_modules (`du -sb`) | 378,656,430 | 305,134,882 | 73,521,548 |
| dependency OCI layer (gzip level 6, mtime 0) | 99,954,149 | 74,381,522 | 25,572,627 |
| dependency-only image expanded bytes | 591,911,881 | 518,390,333 | 73,521,548 |
| dependency-only image compressed layers | 178,600,163 | 153,027,536 | 25,572,627 |

These are **dependency-only images**, with the same Node base and a single
node_modules COPY, not full application images. The OCI layouts were exported
from actual Docker save layers with a fixed compression method. Full digests,
layer sizes and base-layer identity are in
[dependency-oci-comparison.json](dependency-oci-comparison.json); the reproducible
local build/export harnesses are adjacent. No registry size estimate is substituted.

The nested OfficeParser PDF.js 6.2.108 remains unchanged. The existing chart
fixture limitation (slide title only with attachments disabled) is recorded in
[the parser evidence](../issue-441/README.md). PDF/DOCX extraction, encrypted,
corrupt, image-only, expanded-limit and cancellation results remain unchanged.

## Packaging and environment limits

The canonical Docker build first failed because the execution-environment
proxy returned 503 for npm tarballs; TLS stayed enabled. Adding the environment's
trusted CA as a temporary build secret corrected proxy trust without modifying
product source or retaining the certificate in an image. Offline locked-cache
installation then succeeded, but the full canonical build exhausted the 32 GiB
VFS Docker storage: VFS copies parent filesystems for each COPY layer.

For a bounded local packaging check, the adjacent harness consolidates COPY
instructions into equivalent source/destination copies, retaining the actual
Node 22 Web/visualize build and final packaged startup commands. It uses the
unchanged Docker build-context exclusions and the same locked offline caches.
The resulting candidate image is
`sha256:a6792bdd958a808a990ae25105621ae458c5d3d89e84a33dbcf21c27837c4496`
(642,019,604 expanded bytes; no full-product baseline comparison). The build and
a separate container run both passed
[packaged startup](packaged-startup-node22.txt): OfficeParser Node/OCR imports,
nested PDF.js, Canvas, Web and Worker linked and reached their expected missing
DATABASE_URL guard. This is import coverage, not deployed readiness.
A first harness attempt mishandled single-file destinations; that temporary
harness was corrected before the passing result. This is not a product change.
The full canonical layer layout and full-product before/after OCI sizes remain
unverified here; the release coordinator should retain those during its normal
image build. BuildKit GHA export/restore before/after also remains unmeasured.

All published Git blobs were SHA-verified against local Git objects. Git push
was blocked by the environment proxy; GitHub Git-data APIs delivered the same
trees. No write was left pending or ambiguous. Separate initial local commit
IDs differed only because GitHub assigned commit metadata.
