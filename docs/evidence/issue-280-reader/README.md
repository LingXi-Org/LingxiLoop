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

The original migration evidence above used OS30af3282 source overlay and remains labelled that way. The actual upstream merge6e715df85de9e6fa4d852d9102772e5c3ca4e8a7 passed exact main release gates [39633799395](https://github.com/LingXi-Org/LingxiOS/actions/runs/39633799395) and formal publication [39635049862](https://github.com/LingXi-Org/LingxiOS/actions/runs/39635049862). The registry3.7.0 gitHead equals that merge; both root/server manifests and locks now pin exact3.7.0 with its registry URL and integrity. No other dependency resolution changed.

`formal-package.json` binds the real registry install and original tarball (SHA256 `337f2ccdbbcb5c0d18f4349a0963386f6c5cdeaeb033582e94da0ca7bc07769f`). All482 installed files equal the tar bytes, and all14 packaged SQL files equal formal3.6 sourcebbe5d489. Compiled public main/ui/worker exports report runtime3.7.0/control11/kernel2/native14/assistantMessage2/publicText2 and unchanged schema hash. `formal-package-inventory.json` contains the exact per-file hashes. The tar was obtained from the already downloaded npm integrity-addressed cache, without repacking or a second transfer.

The reader worktree now uses this separately installed formal runtime; shared source-overlay trees were not modified. `formal-typecheck.log` is a successful server compile; `formal-owning-green.log` is5/5 for the three existing projection/transport cases, exact package-profile negatives and pure disabled metadata; `formal-lint.log` passes for the three changed leaf/config files. The first owning command stopped at module loading because its synthetic DATABASE_URL was omitted (`formal-owning-missing-env.log`); the corrected command used synthetic loopback constants and lazy Redis mode, with no DB/provider operation. The earlier PostgreSQL tests were not rerun; final exact CI is still required before release.

Target descriptor: runtime3.7.0/native14/protocol11/publicText2/product51 plus all51 actual migration checksums and real package/image provenance. Producer remains disabled throughout the reader phase. Only after every active Web/API/SSE/history reader and Worker has the qualified reader build may a separate explicit producer-enable change be released. From the first v2 history write, old strict readers cannot return even if production of v2 is later disabled. Real-provider semantic compliance remains unverified; no extra broad model/browser matrix is requested here.

## Pure deployment metadata

`server/src/agent-runtime/public-text-deployment.ts` exports the frozen publicTextDeployment `{reader:2,producer:'disabled'}` and `publicTextModelOptions()`. The actual runtimeModelConfiguration consumes both. The leaf imports no control/database/provider/environment modules. A metadata oneoff can read this module and the published package's releaseVersions without importing runtime.ts. Reader mode must return an empty options object; a later explicit producer release changes the reviewed value to`purpose-json-v1` and updates its owning mode expectation.

Deployment-metadata red/green records a missing pure module followed by1/1 passing pure-import/immutability/disabled-options check. This does not require a new PostgreSQL, provider or browser run.
