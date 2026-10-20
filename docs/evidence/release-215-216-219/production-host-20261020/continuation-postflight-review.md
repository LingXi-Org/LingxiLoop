# 3.5.8 host continuation postflight review

Reviewer: `/root/maintenance_resume_review`, 2026-10-20.

## Decision and scope

No unresolved P1/P2 findings in the revised continuation collector, final verifier and actual-production reader reviewed below. They may be used for postflight after the owning v2 continuation completes. This is a local static review and comparison of existing sanitized evidence, not a declaration that the continuation or production acceptance passed.

No production API request, service action, configuration change or product-code change was made by this reviewer. The continuation driver is independently owned/reviewed by `host_preparation_review`; it is not approved by this report. The parent remains the sole executor.

The v2 receipt was `complete=false` when the evidence chain was independently checked. Do not treat this report as permission to bypass its completion gate or omit the actual postflight reads.

## Reviewed immutable script versions

| File under `/tmp/lingxi-358-production/` | SHA256 |
| --- | --- |
| `collect-host-continuation-receipts.mjs` | `532757defa155ac983890dae0108fe47f503cd4120d21e12a205344c7bbdd7cf` |
| `verify-host-continuation-postflight.mjs` | `e874e6b97dda1522eaa0cdadd45c03af16ee229401d8637e5ad9be4accfc88b8` |
| `read-production-host-after.mjs` | `b6a85e6f041fa703e3c074c1b0c1b01a8945bc6849d7a732438e76d100d62f52` |

All three passed `node --check`. The collector and production reader were not executed by this reviewer, since they perform production reads. The final verifier was not executed against incomplete production evidence.

## Required chain and failure history

The original execution belongs to plan `67db9eb7800edda238fb8e9a72dbcb28793f50314a92a731c361874842ac0849` and is retained at `maintenance-host-execution.json`, SHA256 `1abf04ec0bd4bf9af1f4883a33189d70f65764c787f6e674c0de2c36f6f623fa`.

The original execution has four completed StopStack actions, a verified fresh backup, successful migration to native13/product48, successful Web A deployment, and exactly one failed Komodo action: Web B DeployStack `6ad778a1e06d5e1f79836ea6`. The final original event remains failed/fix-forward. Its failure is not converted into success.

The first continuation failed validation before any `phase=komodo` event and remains `complete=false`. It is retained separately as `maintenance-host-continuation.json`, SHA256 `8891fdd6c6ce5bf85e650772e74c0a6dc8d490356d3eb16983748b49d4e9a54f`.

The new chain uses `maintenance-host-continuation-v2.json`. Its original-execution hash and failed-validation hash were independently compared with actual file bytes. Both matched, and `failedValidation.noExecute` was true. Its final byte hash must be collected only after the v2 receipt is sealed.

The combined collector/verifier enforces:

- v2 completeness, plan identity, final complete event and original failed B update identity;
- exact actual-byte hashes for the original execution and completed v2 receipt;
- preservation of v1's failed validation and absence of its Komodo execute events;
- four successful StopStackService receipts and four successful DeployStackService receipts across the original and v2 executions;
- exactly one expected failed action, the original B update, while all other collected updates must be Complete/success=true;
- each action's exact update ID, public operation and Stack target, with current Stack identity resolved by the collector;
- original fresh backup attempt and command hash, isolated restore verification/removal, source provenance and dump digest;
- a distinct exclusive final output, `production-host-continuation-acceptance.json`, leaving original scripts and failed execution records intact.

The collector does not silently retry an operation. It issues read requests for existing update identities. An unknown, incomplete, wrong-target or unexpectedly failed update prevents the verified receipt file from being written.

## Image identity correction

The previous verifier's assumption that Docker `InspectContainer.Image` must equal OCI config digest `019d5728…` was a false-rejection risk. Existing production evidence shows this image store returns the audited OCI index digest as both the image inspection ID and container image identity.

The revised verifier does not accept an arbitrary choice of config or index ID. For this sealed release it requires the actual known index identity:

`sha256:697d5a3e3d34629e603c120cd068abde3a2add611f583d5444d77a947887bf69`.

It separately binds the audited config digest:

`sha256:019d5728f0ef708fe9a642eaf1effd2c12699cdb303e2206e11b55e542fb2c4b`.

The revised actual-production reader records image architecture, OS, Descriptor and RootFS on both application hosts. The final verifier requires both images' exact index ID and RepoDigest, Descriptor digest, linux/amd64 platform and full ordered RootFS diffID list to match the passed image audit for application commit `d1075e35e16721979b484c2d9e33eeb56468ce9d`. All four actual containers must reference that same qualified image identity and declare the exact target source.

Independent local comparison of `host-target-image-identities.json` (SHA256 `cd911f3ab2b62576d16ed0c2cae83cbbba6bea2ffc9a39060f569d6f3882b1ae`) against the existing passed OCI audit confirmed:

- exactly shanghai-a and shanghai-b;
- exact candidate source and index digest;
- linux/amd64 on both hosts;
- Descriptor digest and image ID equal the audited index;
- every one of the 22 ordered RootFS diffIDs equal the audited layers.

This check used existing local diagnostic data. It did not refresh production image state.

## Final factual acceptance

The final verifier requires all of the following, in addition to the chain above:

- completed preparation and its nine successful terminal receipts bound to the preparation bytes;
- four distinct actual service containers, exactly Web and Worker on each application stack;
- actual running/healthy containers, no restart/OOM condition and idle stacks, as enforced by the reader's `verified` result;
- exact target image source and declared source, zero restart counts and unchanged recorded security policies;
- exact app host-file mode, release branch, commit pin and `reclone=false`;
- final continuation state and separately read actual DB state at native13/product48, with runtime, protocol/schema hash and the full migration checksums;
- target public version and successful public health endpoints;
- exact Worker command, entrypoint and native readyz health check;
- the new terminal collector bound to the original and v2 file bytes;
- actual root/entry-JS/CSS responses matching the audited image bytes through the public asset checker.

The isolation statement remains correctly qualified as an inference from the qualified startup path and healthy native readyz. Authenticated business smoke remains explicitly not run because no existing authorized smoke cookie/company ID was injected. No credentials were created or copied.

## Remaining execution conditions

The owner must wait for the known v2 continuation result, then run the fresh actual-container/image/public reader and target-state reader, collect terminal receipts and public asset evidence, and run the final verifier. A false or missing result remains a failed/incomplete acceptance. No older image may be restored merely because deployment failed after migration to native13/product48.

The mirror 522 remains a real registry availability failure. Host-file mode removes Git from these operations but does not remove Compose registry dependencies; this report makes no contrary claim.
