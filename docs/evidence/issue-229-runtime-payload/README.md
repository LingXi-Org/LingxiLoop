# #229: narrow the final ZCode payload and remove an unused self-link

Base: `535873b941815b41961a44f56e479257cbb71626`. This is a small independently reviewable step for #229, not completion of its full cleanup/release acceptance. No source feature, test, authorization, migration, runtime version or isolation setting is removed. No publication, deployment, production query or issue closure was performed.

## Deletion decisions

| Candidate | Evidence / retained coverage | Change and rollback |
| --- | --- | --- |
| ZCode upstream reference source in the **final image** | SPA esbuild consumes 157 upstream inputs; the final server only reads the complete skill and `upstream/.../genUiTweakRuntime.js` (`visualize-skill.ts`, `visualize-export.ts`, `im/visualize.ts`). Runtime manifests and Python helper resolve assets inside the preserved skill. | Replace only the final-stage broad COPY with four explicit COPY instructions. Keep the complete source and verifier in Git and the SPA build stage. Revert that Docker hunk to restore the former package. |
| Duplicate `runtime/tweak.js` and review-only root metadata in the final image | Served `tweak.js` comes from the preserved upstream file. Build verifier checks the duplicate and metadata before the bundle build; no server filesystem consumer exists. | Exclude these files from final COPY, preserve source in Git. Root README, full pinned manifest, both Apache LICENSE copies and all skill licenses remain. Exact 199 removed paths: `payload-comparison.json`. |
| `server` dependency `lingxiloop: file:..` | Independent AST audit: 407 server files, 411 entry closure files, no package consumer/nonliteral dynamic resolution; explicit tool/harness objects, no root package runtime API. Offline virtual dependency trees differ only in parent metadata and the self-link. All other 21 direct dependencies have consumers. | Remove the one manifest field and three lock records. Every other lock field is identical, including version/integrity. Reverting these fields restores the link. No claim that it previously installed the frontend tree. |
| Other direct dependencies / effective tests | Each dependency has a concrete owner; no obsolete-test replacement was established. | Retained. Broader cleanup requires separate evidence and PRs. |

## Same-input measurements

The actual local BuildKit `FROM scratch` probe uses all non-cross-stage final COPY instructions and the **unchanged production Dockerfile-specific ignore file**, with network disabled. It executes no RUN, pulls no base image and publishes nothing. It measures the source payload only: base image, production node_modules, built SPA and OCI metadata/layers are excluded. Before and after inventories contain paths, bytes and SHA256; all 29 retained ZCode files are byte-identical. Only the Dockerfile and two server dependency metadata files changed elsewhere in the payload.

| Metric | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Final source COPY files | 712 | 513 | 199 |
| Final source COPY content bytes | 6,484,698 | 4,423,049 | 2,061,649 |
| ZCode files | 228 | 29 | 199 |
| ZCode content bytes | 3,238,703 | 1,182,142 | 2,056,561 |
| Deterministic source tar bytes | 7,045,120 | 4,823,040 | 2,222,080 |
| Deterministic source tar gzip bytes | 1,571,865 | 1,037,325 | 534,540 |
| Server lock text bytes | 183,173 | 177,447 | 5,726 |
| Virtual lock nodes | 348 | 346 | 2 metadata/link nodes |
| Generated gen-ui.js bytes | 506,205 | 506,205 | 0 |
| Python calendar standalone bytes | 918,950 | 918,950 | 0 |

The gen-ui.js SHA256 is `78dfe495e3a5398a0cbc4123ccc23631dc203ac9da51b4bfd915879513e36494` in both builds. The real Python exporter produces SHA256 `5f8dc7484e867a8ca7c8a050478e73a46918bf83e53c1114866bc79700f5c91c` in both exported trees. The complete 24-file skill is preserved.

Probe elapsed times (export + inventory/hash/tar work) were 1.015 and 0.911 seconds. These single cached samples are **not** full image build speed measurements. Full SPA bundle, installed-dependency before/after disk, complete OCI compressed/uncompressed size, full build duration and peak disk were not measured; no savings are claimed for them. The isolated candidate prod-only install used about 324 MiB on this filesystem. Source code remains in Git; repository deletion savings are not claimed.

## Checks and limitations

- The owning contract was added and failed before the packaging change (`contract-before.log`). Its final strengthened form also fails against a frozen base (`contract-final-baseline.log`). It checks required paths/destinations, excluded reference source, preserved SPA input and a 1,250,000-byte ZCode runtime budget.
- Final deployment contracts + release-smoke tests: **24/24 passed**, no skip (`contracts-after.log`).
- Pinned source verification before/after: complete 223-file manifest and 24-file skill pass; unchanged gen-ui bundle built from 157 inputs. Full upstream inputs remain available to SPA build.
- Real BuildKit COPY exports before/after passed; receipts/inventories retained. No broad ignore-rule change.
- Real Python standalone export from both packages passed with identical output. The first command used an unsupported `--output` option; that harness failure is retained (`render-initial-harness-error.log`). The corrected invocation uses the documented positional destination and is not counted as a product red.
- Isolated `npm ci --offline --omit=dev --no-audit --no-fund` installed 310 packages, with normal lifecycle scripts. It used the existing cache, not the root development node_modules. Exact installed LingxiOS is still **3.5.6**.
- On the exported candidate with those prod-only dependencies, the actual production Web/Worker launchers and migration entry link and stop at `[env] Missing required environment variable: DATABASE_URL`; no module or syntax error (`packaged-startup.log`). All 13 allowed skill reference reads and a rejected traversal passed (`packaged-skill.log`). These are credential-free link/resource checks, **not** DB readiness or successful isolated Worker startup.
- No provider, HTTP/PG business integration, live authorization race, full frontend build, final OCI startup or rollout check was repeated for this packaging-only change. Existing feature/permission/history/migration tests remain unchanged.
- Release coordinator reports base `535873b9` image Web, migration and 997 static files passed, but actual Worker exits 1 because bubblewrap lacks namespace permission. This is **not passed or solved here**; do not disable isolation to bypass it. #216/#219 candidates and their separate gates are outside this patch.

## Reproduce

Use Node 22 and the locked root dependencies. In separate base/candidate checkouts, first run `node scripts/build-visualize-runtime.mjs` so generated server assets are identical. Then, from the candidate checkout (output directory must be new):

```sh
python3 docs/evidence/issue-229-runtime-payload/measure-payload.py /path/to/base /tmp/payload-repeat before
python3 docs/evidence/issue-229-runtime-payload/measure-payload.py /path/to/candidate /tmp/payload-repeat after
node --test scripts/production-rag-contract.test.mjs scripts/release-smoke.test.mjs
node scripts/verify-zcode-visualize.mjs
node docs/evidence/issue-229-runtime-payload/import-audit.cjs /path/to/base /tmp/import-repeat.json
node docs/evidence/issue-229-runtime-payload/lock-audit.cjs /path/to/base /path/to/npm/node_modules/@npmcli/arborist /tmp/lock-repeat
```

The import/lock scripts are portable copies of the independent audit, with repository/output/module paths parameterized; both were executed again. Run the lock comparison against the **base** manifest; the script creates only separate virtual baseline/candidate copies, not an install.

For each exported `/tmp/payload-repeat/{before,after}/export/app`, invoke `python3 -B third_party/zcode/skills/visualize/scripts/render.py third_party/zcode/skills/visualize/examples/calendar.html /tmp/unique-calendar.html --title 'Runtime payload qualification'`. Use a new destination for each case and compare hashes.

For packaged entry checking, install the candidate server manifest/lock into a new isolated directory with `npm ci --omit=dev --no-audit --no-fund` (existing offline cache used in this run). Place that node_modules and server manifest/lock at the exported app root, matching the Docker deps-stage layout. Run `node server/scripts/check-packaged-startup.mjs` from the exported app; invoke the migration script with the same tsx launcher and an environment containing only NODE_ENV=production, DOTENV_CONFIG_PATH=/dev/null, TSX_DISABLE_CACHE=1. Expect the missing-DATABASE_URL guard. Do not supply production configuration for this probe.

`receipt.json` binds the changed source files. `SHA256SUMS` binds submitted evidence; screenshots, generated binaries, credentials, memory bodies and private operations data are not included. Independent review identified three unrelated JSON Unicode escapes; the final lock restores the original characters. Only the exact audited self-link deletion remains, and the final source export, contracts, three entry links and Python export were repeated. Independent exact-commit review and CI are recorded in the PR separately.
