# Native14 / product50 production delivery

Production is **b47723d8948708cd9b1ab230776e053d4b034c5c**, formally published runtime **3.6.0**, native schema **14**, product migration **50**, control protocol **11**. The ordered maintenance completed at **2026-10-20T19:22:58.543Z**. Final evidence verification passed at **2026-10-20T19:24:02.315Z**, with all **15 checks true**.

Final acceptance SHA256: `4e20d36acc1ab4d6789a623f8c6b7462b57122135a0e30a78a4362a5167d3150`. This is actual production evidence, not an offline rehearsal or a PR-only CI result.

## Delivered behavior

PR258 and upstream LingxiOS PR38 add the public, durable skill-delivery obligation. Activated visualization authoring must deliver an authorized current-request renderer reference, enter the repair path when that reference is missing, or preserve an explicit non-delivery outcome. The final protection remains enforced. Ordinary code examples, reads and exports do not activate this obligation. Request identity, deletion/revocation checks and the borrowed transaction connection remain enforced.

Earlier fixes remain included: public memory-tool text flow and removal of activity aggregate controls; conversation history/loading/cancellation and personal-list delete/restore (0049); visualization timeout/retry isolation, visible-only history startup, rounded-corner gutter and expanded CSS zoom; numeric contracts/geometry; CLI lifecycle fixes. PR252 and PR254 were closed after their changes were incorporated, rather than independently GitHub-merged.

## Exact qualification and production sequence

- PR258 head `23e08903356b5d3fbe84c1d78f4eb845674e0d1a`: CI39475944767, 355 pass / 0 fail / 14 skip. The first 351/4/14 failure remains recorded in the implementation evidence.
- Final merge `b47723d8948708cd9b1ab230776e053d4b034c5c`: [CI39478308509](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39478308509), exact successful server/deployment-contract/integration checks and immutable server image publication. Actual integration: **369 total / 355 pass / 0 fail / 14 skip**, including 0050 atomic upgrade/rollback and the real native-worker missing-reference repair/delivery/export fixture. Deploy/update-manifests/rollout were skipped.
- Formal package 3.6.0, exact manifests/locks and installed public schema resources were verified. Full image audit: **22 layers**, runtime **479/479**, PDF.js **379/379**. Streaming audit took 22.351 seconds and persisted no layer bodies. The compressed rootfs inventory in this directory contains file metadata/hashes only; its decompressed SHA256 is `e2bb3edfe28469b27d00a7189c49a0be4e618340ed01db1377617794476a2714`.
- Frozen public driver: `19422466f8463a3a1099c6fbfdd3b92d0228e1b5`. Plan hash `78549c867d29c4b5e366d2eba34bf31bff1875fd2828935394fb98f61dd297cd`. Two-node image preparation completed before maintenance; original configurations and four source container identities were verified unchanged afterward.
- Separate canonical seed precheck `6ad7bd8ce06d5e1f79837d56` used a read-only repeatable-read transaction and rollback: plans=1, entitlements=8, planEntitlements=8, missing=0, mismatched=0. No identities, grants or credentials were created. This establishes existing logical values, not that the public migrator's existing UPSERT performs no physical writes.
- All four source writers stopped. Two full source barriers and subsequent pre-migration barriers recorded zero live work/session/attempt/capture/outbox leases, other clients and prepared transactions.
- Fresh snapshot/isolated restore `6ad7be6ee06d5e1f79837d93` succeeded: counts and provenance matched, temporary restore database removed, retained dump SHA256 `5a7941516edb32c7b7938fc2ae377163d4fb3ba4c8d450912b5a2583b2419837`. No production data reset or migration rehearsal occurred.
- Once-only migration `6ad7bebee06d5e1f79837da7` installed native14/product50 and was read back successfully. Recovery is now **fix forward**; do not start a native13 Worker or replay this migration.
- Ordered restore: Web A, Web B, Worker A, Worker B. **43 release native terminals** (8 preparation + 35 maintenance), plus the **separate one seed terminal**, were freshly reread as Complete / success:true. No uncertain operations remain.

| Service | Native deployment receipt | Final result |
| --- | --- | --- |
| lingxiloop-app-a / lingxiloop | `6ad7bedde06d5e1f79837db1` | healthy, 0 restart |
| lingxiloop-app-b / lingxiloop | `6ad7bf0ee06d5e1f79837dc1` | healthy, 0 restart |
| lingxiloop-app-a / worker | `6ad7bf3fe06d5e1f79837dce` | healthy, 0 restart |
| lingxiloop-app-b / worker | `6ad7bf6ae06d5e1f79837dda` | healthy, 0 restart |

## Current image and source identity

- OCI index: `sha256:89f2b78b6c6bd7aecef5b5e19cf282189a7920ecd85d67013238ea6bfc5cd558`
- linux/amd64 manifest: `sha256:7521c15fe36e01bf8921823d63a12dea8af354da34cb20bb4a68d34951e139f5`
- Config: `sha256:b8fb1ec8983ec4654c4eba9bf0509fe0a72e802329527daf98adf864aed39ca6`
- App Compose branch: `release/native14-product50-production-20261020`, final `f8723361ea87ef6e051484350ecaea623d091b46`, preparation parent `b1eef031e65c3d4477afc7e16d1c93a4d826e72e`. Core source remained unchanged.
- Four current containers match the target image and source, are healthy with zero restarts, and preserve source security/runtime policies. Both Worker ready checks, exact startup commands and entrypoints were confirmed; the broader startup-isolation conclusion is explicitly an inference from these checks.
- Final read-only postflight: 16 API reads, zero writes/execute/SQL/provider calls; three hosts healthy and stacks idle. `/api/health`, `/readyz`, `/api/health/dependencies`, `/api/meta` returned HTTP200. Public metadata reports the exact target, runtime3.6.0/native14/protocol11. These are point samples, not proof of balanced traffic.

## Scope and remaining verification limits

The historical **25 real provider calls** in #247 are not 25 test cases. The earlier bounded complete-delivery result was 0/2. Those original outputs were retained and were **not rerun or relabelled green** by this deterministic repair. This release does not establish arbitrary model numerical/HTML coordinate correctness, a production latency percentile, authenticated browser acceptance, clipboard-denial/real-touch coverage, an official-site comparison or a full fault-injection/isolation matrix. No new login identity was created; the paused fixed3.5.3 durability observation was untouched.

The previously requested six supplemental browser cases remain unrun under the user's narrowed acceptance scope. Production delivery and closure are based on the actual affected fixes, exact CI and necessary production checks above, not a claim of exhaustive coverage. A newly reproduced residual defect should be tracked and developed separately; no additional provider loop was added here.

## Evidence and replay

`SHA256SUMS` binds the copied actual artifacts. `final-acceptance.json` lists all input/external evidence hashes; `terminal-receipts.json` binds the ordered 43 receipts and separate seed proof. The immutable helper sources and failure model are already committed in `docs/evidence/native14-release-preparation-20261020/` at `c45b013816ca8ccf97051e6438e39c3bc7d31096`; absolute working paths in receipts describe the execution environment, not portable execution commands. Source7fe acceptance is in `docs/evidence/visualize-geometry-production-20261020/`.

No backup/restore, migration or deployment command in these artifacts should be replayed. All operations are complete; any future release requires its own exact target and fresh plan/backup.
