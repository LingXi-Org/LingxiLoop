# Explicit3.7 reader upgrade candidate

Issue280; base main d601b461fbde5da05bc94b27d8dae565935de21c. Root reserved product0051. Independent reader-only branch; no merge, publication or production operation. Prior producer-enabled draft282 remains separate. This branch imports only its already reviewed public-purpose projection and owning transport test; runtime configuration deliberately omits `publicTextProtocol` and requires publicText2. All real answers remain visible according to the public purpose while current; superseded/accepted identities retain the existing history policy.

## Exact migration boundary

Product0051_public_text_reader requires full validated50 migration names/checksums, installation runtime3.6.0/native14/control11 and native schema hash `c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f`. It changes only the installed runtime string/timestamp, in the transaction that records0051. Native schema stays14. All50 historical SQL files, including0050, are byte-identical to main (historical-checksums.json).

The package profile requires exact runtime3.7.0/native14/control11/publicText2 and that schema hash; unknown versions/capabilities/hash reject. A historical migration range ending0050 retains its exact formal3.6.0 package requirement. Fresh full installation with the3.7 reader profile still executes the original0050 source13/runtime3.5.8→native14/runtime3.6.0 transaction, then advances0051. Existing target51 must already match3.7; neither repeated migration nor startup silently adopts a damaged installation row. Previous blanket end-of-run provenance update is retained only for historical profiles.

The normal migration entrypoint still performs its existing education-plan upserts after schema/provenance verification. Do not call it read-only. This is a runtime/provenance transition, not an ordinary34-update same-schema release or native13→14 plan. Root owns the separately reviewed deployment descriptor and all actual execution.

## Necessary local evidence

- Failure model first. Original runner rejected both new migration cases with its exact3.6 package gate: `red.log`,0/2.
- `green.log`:6/6 in2.65s: two actual isolated PostgreSQL migration cases, three existing public-purpose transport/projection cases, one exact package-profile negative case. Covers fresh51, source50→51 with a database event trigger forbidding all DDL, unchanged native relation identities/history, target repeat stability, transaction rollback when ledger insert fails, missing/corrupt runtime/native/protocol/hash, corrupt historical checksum and refusal to adopt a mismatched target.
- `historical-0050-green.log`: the existing0050 ledger-failure/native rollback owning case1/1 passes. Its full upgrade now expects0051 after0050; all other migration-list/count expectations are mechanically extended to51. The remaining historical migration suite was not rerun locally.
- Server source-overlay typecheck passes; targeted seven-file lint passes, plus the final import fix lint. `producer-disabled.json` calls the actual public configuration function with synthetic constants and confirms the producer option is absent. The final configuration check uses the existing lazy Redis mode and makes no provider/Redis/database request. An earlier non-lazy import attempted only synthetic loopback Redis port1, then was terminated; no external or production target was used.
- PostgreSQL used the already cached pgvector/pg16 image, a task-owned256MiB tmpfs and a random loopback port. Container `lingxi-purpose-reader-pg` was stopped and automatically removed after the short tests. No image pull, dependency install, external provider or production/private data access.

## Formal dependency and release boundary

Local node_modules points to the isolated upstream source overlay at OS30af3282ca343ca01fa09bd5b97fe819e57b80ab. Its3.7.0 upstream release-gates CI39632097077 succeeded and independent source review is GO, but it is **not yet a formally published package**. This draft intentionally leaves the existing formal3.6 dependency/lock untouched; do not merge/deploy until the real3.7 publication is verified, exact registry integrity is locked and the exact integration CI is green. Source-overlay results do not satisfy that gate.

Target descriptor after formal pin: runtime3.7.0/native14/protocol11/publicText2/product51 plus all51 actual migration checksums and real package/image provenance. Producer remains disabled throughout the reader phase. Only after every active Web/API/SSE/history reader and Worker has the qualified reader build may a separate explicit producer-enable change be released. From the first v2 history write, old strict readers cannot return even if production of v2 is later disabled. Real-provider semantic compliance remains unverified; no extra broad model/browser matrix is requested here.
