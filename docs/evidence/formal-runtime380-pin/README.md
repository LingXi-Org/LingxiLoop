# Formal3.8 consumer lock and focused qualification

Base integrated candidate3b8a712af056b6937e7735d9328c646b920f75d8. This commit changes only root/server package.json and package-lock.json plus this evidence directory. Runtime/profile0052, all SQL, enabled producer leaf, trace bridge/UI and release drivers remain byte-identical to that base. The root integrator handles the separate controlled-provider fixture corrections and the final combined release CI.

Both manifests now pin exact @lyyzka/lingxios3.8.0. Both npm-generated locks use the actual registry tarball URL and integrity, with every unrelated resolution unchanged. No file dependency, copied runtime source, new credentials or source overlay is used.

Root-authorized formal publication [39644653369](https://github.com/LingXi-Org/LingxiOS/actions/runs/39644653369) succeeded. The supplied package receipt is copied unchanged as formal-package.json, SHA256f784cf95175b25d5e5edcd6eddb3fa234d189b03ad314302580bec216881b2ff. It binds registry GitHead9ae65079085f196870ece41500472a333f9abfbf, all488 packaged files,14 unchanged native SQL files and four public exports. Original tarball SHA2567882cf7d7761a1dfe1775bcde6cdc396c30b1a3a78b9d4b47b40822d31d1d92e. That prior actual package audit was reused, not rerun or relabelled as this agent's new audit.

The consumer independently resolves the already-installed formal package at /workspace/public-run-trace-contract/formal380/node_modules/@lyyzka/lingxios and checks actual compiled runtime3.8/native14/control11/publicText2/runTrace1 plus schema hashc56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f. consumer-verification.json binds the real registry metadata, both exact lock hashes and the supplied receipt. verify-consumer.mjs is the reproducible local verification script. Its first draft used CommonJS resolution against an ESM-only export and failed before reading capabilities; consumer-initial-resolution-error.txt retains that setup limitation. The corrected check uses official ESM import; no product/package code changed.

## Actual minimal checks

- Server TypeScript compilation: PASS, server-typecheck.log.
- Web plus Node-config TypeScript compilation: PASS, web-typecheck.log. First run stopped because the sparse checkout omitted the unchanged vendored range utility. web-typecheck-sparse-missing.log retains that failure. Materializing the tracked utils directory fixed the environment; no file bytes changed. Only Web compilation was repeated.
- Existing20 contracts: PASS20/20 in6.62s, owning-green.log. Native trace projection3, optional coverage10, purpose streaming/accepted identity4, enabled producer leaf/actual Worker configuration2, exact0052 package profile1. Existing synthetic environment constants and lazy Redis mode are used; no PostgreSQL, external provider, browser or production operation.
- Full staged base-to-candidate diff check passes. Four-file diff is only runtime version/registry URL/integrity; all non-runtime lock entries compare equal after applying those three expected fields.

No paid provider or broad integration suite was rerun. Prior source-overlay and PG receipts retain their original scope. This local qualification is not final exact CI, image or production acceptance. Root alone merges, releases and deploys.
