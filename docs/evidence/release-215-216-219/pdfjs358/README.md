# Server PDF payload: formal3.5.8 combination qualification

PR235 `89cdee546c94b8b61da7f067752b65c35ce00428` was integrated normally at
`19c35dfdfad63c665a824dc403a04951d8a7714e`. Its own exact-head CI passed;
the combined final head must pass CI and publish-only image checks separately.
No running workflow or image build was cancelled for this addition.

A new private server-only install used the combination's exact3.5.8 server lock,
Node22 and `npm ci --omit=dev --no-audit --no-fund --prefer-offline`. It installed
310 packages. All474 runtime files match the integrity-verified formal registry
tar. No shared dependency or SPA install was changed. Only this temporary PDF.js
copy was pruned; the package version, complete consumers and path whitelist were
checked before any deletion. The independent scan of17,422 code/JSON files found
exactly the three expected references, with only the native document-worker as
runtime code consumer.

The exact554-file PDF.js6.3.289 package becomes379 files;175 viewer/map files
account for10,508,615 regular-content bytes. All379 retained path/content hashes
are identical and all11 licenses remain. Both generic and active legacy imports
link. Formal3.5.8's actual document-worker reads the existing triangle PDF before
and after pruning and returns identical201 bytes with SHA256
`30ee46cdb0878604ece1e00fab7a9807f3db64ff443a48e6dc2fe4a5646a5e04`.
The native output/stderr, install, whitelist inventories and exact script are
retained in `/tmp/lingxi-225-219-preparation/pdfjs358-qualification/`; this archive
contains the metadata/hashes, both empty stderr files and no credentials.
No model/provider or database was used.

The combined packaging and release-smoke contracts pass24/24,0 skips,2.491s.
Independent review found no confirmed P1/P2. The build itself must exercise the
new deps-stage whitelist/import checks and final packaged Web/Worker entry check.
That entry check stops at the no-DATABASE_URL guard and is not readiness.

The older package-copy deterministic gzip decrease of2,037,920 bytes is not a
measured final OCI saving. The later combined image includes runtime and product
changes as well; record actual immutable index/amd64 digests, complete compressed
and expanded layers, merged file inventory, build observations and limits before
stating image results. One PDF fixture does not exercise every CMap/font/WASM
variant; those retained resources are byte-identical. Remaining safe-cleanup,
controlled cold/warm peak-disk and production acceptance work keeps #229 open.
Production maintenance is still on hold; no stop, backup, migration or deployment
is represented here.
