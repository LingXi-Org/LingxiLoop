# Native Design / Slides acceptance

The frozen pre-refactor source is `d004312841026a4d90dfbd9e8292a55cc29a2e95`.
Its Design editor, Slides editor and complete production frontend were rebuilt
successfully in `/workspace/scratch/lingxiloop-editor-baseline` before retirement.
[baseline-build.json](baseline-build.json) records hashes and **static build sizes**.
Those sizes are not measured browser transfer or startup results.

## Current qualification

The real authenticated baseline service could not start: the exact published
`@lyyzka/lingxios@3.8.25` package is unavailable in this environment. The actual
startup attempt failed at the migration module import with `ERR_MODULE_NOT_FOUND`;
[baseline-service-blocker.txt](baseline-service-blocker.txt) preserves the failure.
No local runtime source, fake authentication or replacement API was used to make
the performance gates pass. The public-dependency-only toolchain can build the
browser bundles but cannot qualify the server.

| Required gate, separately for Design and Slides | Status |
| --- | --- |
| Full authenticated application cold editable p75 improves at least 30% | Unverified; no paired samples |
| Actual transferred scripts decrease at least 50% | Unverified; build size is not a substitute |
| PSS after all 50 pages, minus authenticated empty-host PSS, decreases at least 30% | Unverified; no paired samples |
| Trusted input to painted text p95 is at most 100 ms | Unverified in the full app |
| At least 10 alternating AB/BA cold samples per arm and mode | Not executed |
| 50-page editing, durable reopen, human/Agent operations and inspected exports | Requires the owning functional results; fixture checks alone do not qualify it |

Historical `perf/issue-652` values describe different source revisions and a
different, smaller sample. They are not relabelled as this refactor's baseline.

## Fixed input and measurement contract

`scripts/native-artifact-fixture.mjs` creates equivalent legacy files and native
documents: 50 ordered slides or 50 positioned artboards, each with an editable
heading, body, distinct 640×360 raster image, formula, shape and table. Slides
also carry notes. Formula variants include fractions, sums, matrices and an
integral, including a formula on the first page. Images total 30,877,750 bytes;
they are 50 distinct PNGs, not 50 references to one image. Native and legacy page
coordinates use 1920×1080. Fixed local image responses exercise real transfer
and image decoding without an external CDN. Upload to object storage and live
model inference are separate acceptance scenarios.

[design-fixture-manifest.json](design-fixture-manifest.json) and
[slides-fixture-manifest.json](slides-fixture-manifest.json) record image, file
and semantic SHA-256 hashes. Local origin changes alter serialized file hashes;
the semantic hash remains the same. The focused fixture regression verifies
50 pages, 50 unique decodable PNGs, valid KaTeX on every page, legacy source
preservation, schema validity and reconstruction through the real shared
operation reducer.

The browser runner uses a new Chromium process and empty cache for every cold
sample, restoring only a valid login cookie. The whole production app loads;
for Design the normal conversation button opens its board, and Slides uses the
normal project/deck URL. Network settings are 4 Mbps down, 3 Mbps up and 20 ms
latency, recursively applied before iframe/Worker execution. Viewport is
1440×1000, device scale 1, CPU rate 1. No concurrent build or benchmark belongs
in an accepted timing window.

Readiness requires the real canvas heading, a decoded image, rendered formula,
trusted text input and a verified painted change. A real save response must
acknowledge the edit before the sample qualifies. The timing endpoint is the
painted edit, with the later save acknowledgement reported separately. Script
accounting uses actual CDP encoded bytes, including source-data Fetch requests
and Workers; screenshots, loaded placeholders and nominal gzip sizes do not
qualify. Network traces redact grant tokens and query strings.

Memory is the dedicated Chromium process-family PSS, covering browser/native,
all renderers and Workers. Each arm/run has a separate authenticated empty-host
process with no editor, sampled five times after settling. The hard memory gate
subtracts that host mean from PSS after visiting all 50 pages. Blank-page PSS is
retained only as an additional diagnostic. No forced GC value is used for the
gate. Input feedback is sampled on pages 1, 25 and 50; traversal must actually
find the corresponding image and formula. Incomplete traversal leaves memory
unqualified. Candidate network traces must contain no retired editor assets.

## Reproduction

Install the exact lockfile including the published runtime first. Provision
dedicated local PostgreSQL/Redis/WuKong services, and run the repository's formal
migration/bootstrap for each checkout's separate database. Do not use a product
database: the local service accepts only `127.0.0.1:25432` databases named
`native_artifact_baseline_test` or `native_artifact_candidate_test`.

The focused service uses the actual production Web/API process, actual
control-plane Worker/D1/Better Auth password login and actual tenant/project
checks. Its JSON output is private mode `0600` because it contains an ephemeral
login cookie. Keep it outside the repository. For example, with the matching
local database and Redis URLs set in the environment:

```sh
node --import tsx scripts/native-artifact-serve.mjs --root=/workspace/scratch/lingxiloop-editor-baseline --port=24411 --api-port=24811 --out=/workspace/scratch/native-artifact-baseline.json
node --import tsx scripts/native-artifact-serve.mjs --root=/workspace/LingxiLoop --format=native --port=24412 --api-port=24812 --out=/workspace/scratch/native-artifact-candidate.json
python scripts/native-artifact-benchmark.py --baseline=/workspace/scratch/native-artifact-baseline.json --candidate=/workspace/scratch/native-artifact-candidate.json --runs=10 --out=docs/evidence/native-artifact-editor/paired.json
```

Run a single diagnostic sample first to resolve any setup or selector failure;
the report cannot pass the ten-sample gate. The runner preserves a failed sample
and screenshot and stops by default, rather than repeating an invalid setup.
`--skip-traversal` is explicitly diagnostic and cannot pass the memory gate.

The service's fixed image resources do not require object storage. Its loopback
storage endpoint deliberately refuses accidental uploads, and its model endpoint
deliberately refuses accidental paid requests. Neither upload nor live Agent
generation is claimed by this performance fixture.

## Checks actually run

- Frozen baseline Design and Slides builders: passed.
- Frozen baseline full production Vite build: passed (5 min 34 s; existing CSS,
  third-party annotation and large-chunk warnings retained).
- Full baseline service: failed before startup on the unavailable formal runtime.
- Focused fixture regression: see [fixture-test.txt](fixture-test.txt).
- Python compilation and MJS syntax checks: passed. These do not prove the
  currently blocked full-application service and benchmark run successfully.

No production deployment or production performance claim is made by this record.
