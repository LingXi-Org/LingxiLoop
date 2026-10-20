# Offline native14 plan failure model

Scope: prepare a plan, never run it. The reviewed driver is exactly
19422466f8463a3a1099c6fbfdd3b92d0228e1b5. The accepted source is
7fe5b16e08dbe6634feb701d64e26c28475b917e (formal 3.5.8, native13,
product49); target must be a separately supplied published commit with formal
3.6.0, native14, product50.

Before implementation, the focused checks require:

1. Missing target SHA, target CI/audit hashes, Compose refs, or unique backup
   attempt prefix stop before writing an output directory. No default target exists.
2. Source acceptance must bind all six original input files, the previous
   acceptance/read hashes, and the exact accepted source Compose refs. Re-run
   its pinned pure verifier at its recorded acceptance time. Changed receipt
   bytes or unhealthy source containers fail, even with `passed: true`.
3. Target CI must be completed/success for the exact target SHA and run URL,
   with successful server publish/server/deployment-contract/integration jobs.
   Legacy deployment/rollout/manifest updates must be skipped.
4. Both image proofs must be full layer audits with complete per-layer digest
   and diff-ID inventory and successful runtime/PDF package comparisons.
   Target runtime reference must equal the actual formal 3.6.0 tar SHA.
5. Verify the local formal registry/qualification bytes, actual tar SHA256,
   SHA512 integrity, SHA1, packaged schemas and manifest. Keep the driver's
   installed-target public-resource validation.
6. Prep must be the sole-parent child of source Compose 1c2ef95c; final must be
   the sole-parent child of prep. Each commit changes only both app Compose
   files. Runtime image/pull policy are the only semantic changes; Core stays.
7. Use the public native13-product49 backup planner with a caller-supplied
   attempt prefix and generated nonce in both attempt and database, then seal and fully validate the native
   host plan. Preparing a backup command is not a backup/restore receipt.

Tests use in-memory synthetic CI/lineage mutations and real existing local
source/formal evidence. They do not fabricate a future accepted target or
write any production evidence. No installation, network, Docker daemon call,
provider call, database operation or Git mutation is part of this helper.
`docker compose config` is local parsing through the frozen public validator.
No complete target plan can be qualified until the real target inputs arrive.
