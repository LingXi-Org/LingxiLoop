# Failure model: unpublished development qualification

Full product qualification must precede publication. The normal migration and startup paths intentionally require exact formally published root/server locks. An unpublished package must not fabricate those locks, bypass that verifier, replace a module with a loader/mock, or stamp database provenance by hand.

The explicit test-only alternative must reject a forged token or caller-supplied success JSON, an unreviewed verifier, changed inputs/verifier bytes, failed or mismatched full-byte audits, a foreign product tree/commit, a different installed runtime, production mode, another Pool, mutated Pool connection overrides, nonlocal databases, historical/subset migrations, and accidentally reused default schema readiness. No implicit environment switch enables it.

Use the already reviewed offline package/source verifier, pinned by code hash. It proves the exact frozen source archive, local package SHA512 and all installed package bytes, root/server ESM resolution, clean product commit and preserved earlier failure receipts. Only its actual successful output mints a process-local opaque token. Each use rechecks the exact local Pool and runtime scope. Both full54/native14 checks and all migration/checksum/provenance logic remain unchanged. The formal lock verifier is untouched.

The development path is never invoked by `migrate-bin`, normal startup or a default integration call. A dedicated fixture passes the token explicitly to migration, schema readiness and reset. Default readiness has a separate cache; successful development readiness must never make a default call pass. The local audit and qualification receipts explicitly record development/unpublished/release-ineligible status. No registry URL is invented.

Only a new `runtime342_dev_<runtime SHA12>_<product SHA12>_test` database on 127.0.0.1:18438 is allowed. An earlier empty database and all failed preparation logs remain intact. A new implementation commit requires a new product snapshot, manifest and scope. No DB/provider operation is part of these offline owning tests.
