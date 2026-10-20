# PR235 PDF.js pruning — independent read-only review

**Verdict: no confirmed P1/P2 finding. The bounded change can be integrated into the formal 3.5.8 combination before its image build.** This is approval of the reviewed packaging change's source/consumer compatibility, not a claim that the final combined OCI, configured services, all PDF variants, or #229 acceptance have passed.

Frozen review: PR235 head **`89cdee546c94b8b61da7f067752b65c35ce00428`**, incremental base **`b82ebdb09ab269d1dc13fd149932d80bd2ba45b9`**. GitHub compare says ahead 2, behind 0: 9 changed paths. PR's overall base remains main `c6c47bddeabb4488f9fe93391f15c695a528260c`; the full PR also includes earlier OCI evidence already present at the incremental base. Every downloaded incremental file's Git blob SHA was independently recomputed and matches the exact compare response. Review target is the two new pruning commits, not an unspecified moving branch.

Current combined product source examined: `/workspace/LingxiLoop-integration-215-216-219` at **`f61732944cfeef540bf07c3327db562c7a1e0798`**. AGENTS.md and repository-review instructions were read. No repository or shared dependency was modified; no production/provider/DB access, package install, workflow cancellation, merge, publication or authentication operation was performed by this reviewer. All reviewer-created evidence is under `/tmp`.

## Findings and integration compatibility

No confirmed P1/P2. The existing Dockerfile, Dockerignore and packaged-startup script at `f6173294` are byte-identical to those at incremental base `b82ebdb0` (`git diff` on the three files is empty). The new script path does not exist there. Therefore the reviewed incremental patch has no identified textual conflict with those production integration points. It changes no root/server dependency version or lock, runtime public API, schema/migration, authorization, cancellation, tenant boundary or isolation setting.

The formal 3.5.8 package still declares `pdfjs-dist@6.3.289`. Its actual compiled `dist/src/context/document-worker.js:26-32` dynamically imports only `pdfjs-dist/legacy/build/pdf.mjs`, resolves `pdfjs-dist/package.json`, and explicitly sets CMap, standard-font and WASM directories. The extraction subprocess keeps its 16 MiB input limit, 200-page limit, bounded output, cleanup/destroy behavior and safe error projection. This change does not edit that package or parser.

An initial read-only scan of the shared development dependency layout was deliberately **not** treated as qualification of the server lock: it has missing/nested/version-different packages, as recorded in `pr235-prune-source/independent-check.json`. It was useful only to hash the identical installed PDF.js payload and inspect 3.5.8's actual parser. The exact production-layout verification below supersedes that incomplete dependency-consumer scan.

At **2026-10-20T10:23:04Z**, this reviewer independently scanned the parent's fresh, task-owned production-only `npm ci` installation at `/tmp/lingxi-225-219-preparation/pdfjs358-qualification/node_modules`, with **formal LingxiOS 3.5.8**. The scan read **17,422 code/JSON files outside PDF.js itself**, and found exactly the script's three permitted locations:

1. `.package-lock.json` (metadata)
2. `@lyyzka/lingxios/package.json` (metadata)
3. `@lyyzka/lingxios/dist/src/context/document-worker.js` (the single runtime code consumer)

This scan excluded PDF.js itself entirely so it did not race the parent's qualification-copy pruning/hashing. Exact evidence: `pr235-prune-source/exact-server358-consumers.json`. Server source/shared runtime source inspection found no viewer consumer; the browser's `src/components/AttachmentViewer.tsx:3-4` imports the generic module and `build/pdf.worker.min.mjs?url` in the **separate complete SPA install**, not the pruned server-deps tree.

## Whitelist, files, licenses and build connection

- `scripts/prune-pdfjs-server-runtime.mjs:8-15`: dry-run default, only explicit `--apply`, actual non-symlink directory, exact package name and exact audited version. A version/layout drift fails rather than silently expanding deletion scope.
- `:18-40`: scans installed dependency code/JSON outside PDF.js, requires the exact three consumers, then checks the current runtime's actual legacy import and package-resource resolution. This is checked consumer evidence plus direct runtime-path review; it is not solely an absent static-import assertion.
- `:42-51`: requires package/types, generic and active legacy entries/worker, relevant licenses, image decoders and ICC resources. The active legacy parser's source maps remain.
- `:54-55,75-90`: deletes only **`web/`, `legacy/web/`, and `build/pdf.mjs.map`, `build/pdf.worker.mjs.map`, `build/pdf.sandbox.mjs.map`**. No recursive global `*.map`, docs/test or dependency-wide pattern is used. A selected LICENSE/NOTICE/COPYING path rejects the operation; non-regular package entries also reject it. Complete retained-file path/byte/hash inventories must match after deletion.
- `server/docker/lingxiloop-server.Dockerfile:34-40`: script is copied into the **deps** stage; pruning executes after `npm ci --omit=dev`, followed by generic and active legacy import checks. Root/server exact LingxiOS qualification and installed release-version checks remain. The npm token mount/handling is unchanged. Pruning occurs before the deps tree becomes the final dependency COPY, so deleted content is not carried as an older final-image layer.
- `server/docker/lingxiloop-server.Dockerfile.dockerignore:26`: explicitly admits only the new build script. SPA dependency install/build and all SPA COPY lines are unchanged. The script is in `/tmp` of the build stage, not a new final runtime launcher. Existing `tini`, Python, bubblewrap and service commands remain intact.
- `server/scripts/check-packaged-startup.mjs:8-32`: asserts viewer/maps absent and active entry/resource/license paths present; scans server source against removed viewer imports before the existing production launcher checks. It intentionally applies to the packaged tree. An unpruned development install failing this check is an expected contract result, not evidence of a product regression.

Independent read-only inventory recomputation from the existing intact **6.3.289** package reproduced **554→379 files**, removing **175 files / 10,508,615 regular-content bytes**, exactly as declared. Removed-inventory SHA256 is `b7078dad6183b1da7ea3d72941951665251a8c5bae057b4322ba845ab7fe3feb`; retained-inventory SHA256 is `627ac2e5b3b928b7bfc75a61815753e64262d894e09146a60b09416bc230db97`, both matching the author's frozen receipt.

All **11 LICENSE paths** in this package remain: root, CMaps, ICC, Foxit/Liberation fonts and all JBIG2/OpenJPEG/QCMS notices under WASM. None falls in the removed set. Generic/legacy `.mjs` entries/workers, types, CMaps, fonts, WASM, ICC and both image-decoder trees remain byte-identical. The package manifest's main/types continue to refer to retained files. No paid service/license dependency is introduced.

## Formal 3.5.8 qualification evidence independently verified

The parent performed mutation only in its independent test install, not in shared worktree dependencies. This reviewer read and recomputed the resulting before/after evidence after it finished:

- Qualification script SHA256 `18939c7333c792f6c9319a2a9e8c1dadf24b825a7174640da46bbef1cdc9294d` equals the exact reviewed PR235 script.
- Before 554 / after 379; exactly 175 removed; **zero removed path outside the five targets**, zero changed retained file, zero removed license path.
- Every recorded hash for the eight non-authentication qualification artifacts checked by the reviewer matches its receipt. No `.npmrc` content was inspected.
- Fixture `e2e/homework/triangle-reference.pdf` SHA256 `33aaa4a900cc81178a5c9c312bc0126b81805423e483e498a9c9b0d423c0a10e` matches the author's original fixture identity.
- Formal 3.5.8 native document-worker output before/after is independently compared **byte-identical: 201 bytes**, SHA256 `30ee46cdb0878604ece1e00fab7a9807f3db64ff443a48e6dc2fe4a5646a5e04`; both stderr files are empty.
- Generic and legacy imports passed in the parent's exact isolated server install. This is stronger 3.5.8 package compatibility evidence than extrapolating from the author's earlier exact-3.5.6-image check.

Receipt: `/tmp/lingxi-225-219-preparation/pdfjs358-qualification/receipt.json`; independent recomputation: `pr235-prune-source/independent-qualified358-verification.json`. The reviewer did not rerun configured Web/Worker, use a database, access a provider or prune another copy.

## CI and residual release gates

At this review's API read, **exact PR235 head `89cdee546c94b8b61da7f067752b65c35ce00428` has successful `changes`, `checks (server)`, `integration` and `checks (deploy-contract)`** in both observed workflows, including [run 39405827966](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39405827966). Publish/deploy/update-manifests/rollout are skipped; no publication or deployment is implied. Raw exact-head check data is in `pr235-prune-source/head-ci.json`. These checks do not replace the final integration commit's own CI.

Remaining gates are bounded and explicit:

- Integrate the reviewed change and the verified 3.5.8 qualification receipt into the sole integrator's final source; run affected final exact-commit CI and actual Docker deps-stage prune/import guards. No need to cancel the already running `f6173294` workflow; it remains evidence for its own earlier source, not for the later combined commit.
- Build and audit the **actual combined immutable OCI** and retain its configured entry/readiness and short-path evidence. The author's package-copy gzip difference **2,037,920 bytes** is correctly labelled, and must not be promoted to measured final-OCI saving before that image exists.
- Only one real PDF fixture has been compared. CJK/CMap/font/WASM variants were not all exercised, but their complete resources and active parser are byte-identical; no confirmed missing-resource defect was found. This is a residual coverage limit rather than an invented P2.
- The strict consumer whitelist is an intentional fail-closed build boundary. Future changes to PDF.js version, installation layout or a new consumer require re-audit. String scanning and the source viewer-path guard are not proofs against every possible computed future path; this review additionally traced the current real dynamic worker and retained resource locations.
- This bounded cleanup still does not close all #229 requirements: complete final-image measurement, controlled full-build duration/peak disk, remaining safe cleanup candidates, final product/permission/migration acceptance, and private recoverable host-cleanup evidence stay with the parent.

No operation was denied, pending approval or left with an uncertain mutation outcome. The review is compatible with integrating this change before the image publication to avoid a separate rollout; the sole integrator retains merge/publish/deploy ownership.
