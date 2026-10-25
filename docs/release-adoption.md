# Offline policy and accepted-component preparation (#495)

`adopt-profile.mjs` consumes only already collected non-secret facts and immutable local Git objects. It performs no HTTP, Docker, credential-store or environment-file operation. It does not investigate the host-A API 403, retry denied ruleset reads, install a policy, claim a handoff or change production.

Run locally:

```sh
node --experimental-sqlite scripts/release/bootstrap-host/adopt-profile.mjs /workspace/scratch/handoff-495
```

An optional final argument supplies the **intended** 40-hex operations SHA for policy allowlists. It is not treated as proof that those bytes are installed. The CLI emits JSON; `loadEvidence(directory)` and `generateAdoption(evidence, {intendedOpsSha})` are reusable APIs. Input files are exactly the host-a/host-b inventory, profile-facts and runtime-metadata JSON files, registry-proofs.json and independent-database-state.json. Immutable source reads use local `git show`/`git grep` only, fixed at `197e2568d46de349bb3ce0a26aefbadaae8f4723`.

The result deliberately has `ready:false`, each policy has `readyForInstallation:false`/`installed:false`, and `accepted.value:null`. `accepted.componentTemplates` contains evidence-backed component fields with explicit null release/sequence/probe/application-provenance fields where proof is absent. These are reviewable templates, not valid bootstrap acceptance payloads. Do not strip the status wrapper and install/bootstrap them as if all prerequisites passed. The integrator owns those remaining gates and the serialized handoff.

## Qualified facts and preserved data

The generator checks the original fixed Compose project/file/environment-file paths, selected services, exact container IDs/local image IDs, healthy source observations, complete mount inventories, configuration hashes and packaged runtime metadata. It reuses the existing root-private envFile path; no env file contents, resolved Compose environment or secret values are read or copied. Unknown metadata fields are excluded.

Canonical image descriptors are joined to independent registry index/platform/config/layer graph proofs and checked using the real host image-identity verifier. Containerd index IDs are never relabelled as config digests. Raw graph proof blobs are verified in memory and represented by digest references in output; graph `Config.Env` bytes are not copied into generated JSON. The integrator can attach the existing exact public graph blobs from registry-proofs.json when assembling executable host plans. A proof reference is not an R2 archive/roundtrip receipt.

Every observed named, anonymous and bind mount is preserved in `preservedInventory`, including containers outside the new target scope. Runtime policy service mounts preserve the original homes volumes. Notebook templates also retain all three Surreal dependency mounts, including anonymous `/data` and `/logs`, in their dependency template and configuration-volume inventory. Those dependencies are not silently added to the writable Notebook service set. Missing/mismatching mounts omit the unsafe target draft and produce an exact pending code rather than inventing a new volume.

Notebook's current image has a complete canonical registry proof, so its source mode remains `image`. The supplied facts contain no repository HEAD/origin/clean-tracked-state and source-to-container file comparison, so `repo-adopted-image` is never asserted. Its Surreal dependency has an observed local index ID, full mounts and version fingerprint, but no independent canonical graph in the supplied registry proof file; that dependency remains pending rather than being relabelled `local-qualified`.

## Auditable runtime contract derivation

`deriveRuntimeContract(metadata, source)` verifies that the running artifact and fixed product source both use `@lyyzka/lingxios` 3.8.12. All 57 SQL source checksums must equal the packaged migration inventory; both host package inventories must also equal the independent database ledger. The independent snapshot must be read-only/full-visibility with native and installed schema 14, product schema/count 57, protocol 11 and the same native schema hash. The source audit also binds migration 0057's `organization_cases.deleted_at` addition and retained agent-runtime deleted-row filtering queries.

The contract uses these deployment equality names, derived entirely from the published releaseVersions tuple observed in the running package:

| Contract field | Mapping for this artifact |
| --- | --- |
| api | `public-text-3-assistant-2-trace-1` |
| worker | `lingxios-3.8.12` |
| checkpoint | `kernel-2-schema-14` |
| control | `control-plane-11` |

These are controller contract names and equality proofs, not undocumented product endpoint versions or claims of compatibility across different runtime versions. No supported-schema range or rolling qualification is invented.

Required capabilities are nonempty: `native-schema-<native SQL SHA256>`, `product-ledger-<complete ordered migration inventory SHA256>`, and `case-soft-delete-<0057 SQL SHA256>`. These preserve the exact installed schema/ledger/data semantics; they cannot be silently dropped or replaced with an empty list on a future artifact. The database profile key is the actual `14:57:<schemaHash>` with migrationsHash computed using the owning helper's canonical hash. Its contract and requiredCapabilities are accepted by `qualifyDatabaseEvidence` in the focused test.

Component contracts use equality names derived from observed metadata and storage fingerprints, independently from the main runtime contract. Notebook's schema marker is its actual RAG schema 1. Gateway uses the adapter-required zero-schema control namespace. WuKongIM uses a zero-schema deployment namespace and exact build/fix/binary/original-mount fingerprints; this does **not** claim that its cold WAL/storage schema was inspected. Component storage changes and shutdown exit codes remain unqualified. Empty `allowedStopExitCodes` deliberately blocks changed-image shutdown acceptance until concrete normal-exit evidence is supplied; it does not bypass capability checks.

## Policy construction and remaining prerequisites

Policy drafts fix loopback `127.0.0.1:17951`, private Node 22.23.3 helper argv, existing env/Compose source paths, `artifactTransport:'r2'`, approved `https://release.lingxilearn.cn` archive origin and file-backed executor credential. Ingress controls reference only approved `https://release-b.lingxilearn.cn` with the existing ingress token and Access client file paths. No new credential or arbitrary URL/command is generated.

Concrete unresolved items are emitted in `pending`:

- Installed executor/operations byte identity, actual policy readback, old publisher zero-in-flight handoff and chosen accepted release IDs/sequences are not contained in the eight facts files. An intended operations SHA never settles these gates.
- Gateway mounts are actually empty and `hotDrainVerified:false`. The generator preserves that fact, never adds a fictitious configuration bind mount, and does not emit a top-level usable ingress policy. Fixed template/output paths, their real read-only gateway mount and loaded-generation listeners must be installed and verified separately before runtime backend draining can work.
- Main-runtime readiness URL/probe coverage is not asserted merely from observed ports. Actual local routes and controller named business probes need verification/binding.
- The independent database snapshot has `otherClients=17`, so it is not a zero-writer/drained handoff. Fresh drain/lease/prepared/client evidence is needed at the real boundary.
- Cached-client read-only DB profiles can use the exact inspected source image and existing envFile without reading its secrets. Owning backup/restore tools still require the actual PostgreSQL username/database name as well as the observed local PostgreSQL container. Those names are absent from these facts; Compose defaults can be overridden and are not treated as proof. The current observer returns schema/lease facts but not `current_user/current_database`, an explicit fact-collection integration gap for the owning thread to close without exposing env values.
- Component shutdown exit-code evidence, component application-commit provenance and the Surreal canonical image graph remain incomplete. Canonical source descriptors do not prove immutable R2 archive parts or daemon roundtrip receipts for future uncached images.

These are operational/evidence gaps, not requests for the user to invent protocol strings or credentials. The generator closes the source-derived contract mapping itself and leaves only concrete observation/installation/handoff work to the integrator. Existing application credentials remain in their original files; no product env value is reproduced in the output.

## Focused validation

`node --experimental-sqlite --test scripts/release/bootstrap-host/adopt-profile.test.mjs` passes three owning tests: exact source/metadata contract derivation and real database-profile qualifier acceptance; complete homes/anonymous mount retention with metadata/env/proof payload exclusion and blocked acceptance; and mount/database drift omission with explicit pending codes.

A local run against the supplied real evidence qualified all 57 checksums and generated all five component templates (`main-runtime-a`, `main-runtime-b`, `wukongim`, `notebook`, `gateway`), retaining the real anonymous Surreal volume IDs. It returned `ready:false`, `accepted.value:null` and 21 specific pending entries. No new production operation, credential or network request was performed.
