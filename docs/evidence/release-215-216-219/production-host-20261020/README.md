# Production 3.5.8 accepted — 2026-10-20

At **14:36:35.332 UTC**, final acceptance passed all **18 checks** for product `d1075e35e16721979b484c2d9e33eeb56468ce9d`, runtime **3.5.8**, native schema **13**, protocol **11**, and product migrations **48**. Independent reconciliation passed. Both Webs and both Workers are healthy with zero restarts, no OOM, unchanged inspected security policies, exact installed migration checksums, and the audited image on both hosts. Public health/readiness/dependency/version routes return 200; index HTML, entry JavaScript and CSS match the audited image byte hashes.

- Qualified manifest: `f56db73dabbaec1e92a421bbad76c239ed8d1ae2`, branch `release/production-358-20261020`.
- OCI index: `sha256:697d5a3e3d34629e603c120cd068abde3a2add611f583d5444d77a947887bf69`.
- Linux/amd64 manifest: `sha256:1c437ff4f2b2f36055fddcf179460963d9f95147406989b48355a0020e4bf862`.
- OCI config: `sha256:019d5728f0ef708fe9a642eaf1effd2c12699cdb303e2206e11b55e542fb2c4b`. Actual production Docker ImageId is the index digest; it is not assumed to equal the config digest. Both hosts' platform and all 22 ordered rootfs diffIDs match the audited platform.
- Application CI39412540194 and publication39413726289 were already qualified. Public host-source tools are commit `16313a843aa824050e7cfb88f66db80193a88492`, CI39436323154 success; publication/deployment jobs skipped in that operations-only run.

## Online source repair and preparation evidence

The prior maintenance failure and compatible 3.5.6 recovery remain separately preserved in `../production-attempt-20261020`; they are not rewritten as successes. A further online reclone also failed after409.603 seconds before metadata ran, with its owned checkout missing. No new service outage occurred during that attempt.

The reviewed structural repair stages exactly three raw public Compose templates with Komodo's supported `WriteStackFileContents` at the same owned paths, with `files_on_host=true`, `reclone=false`, disabled automatic deployment and unchanged environments/security/credentials. Nine exact terminal receipts passed: three file writes, four actual DB-free metadata calls and two source-state reads. Fifteen host hash checks matched. Original four container IDs/PIDs/restarts/health remained unchanged. Preparation took275.913 seconds;48 readiness samples inside that window were all200.

The four metadata calls took6.717–7.961 seconds in Komodo, or12.356–13.243 seconds including source guards; the two source reads took673/681ms in Komodo, or5.855–6.584seconds with guards. These are observed calls, not a percentile or general speed claim. No production Git clone was submitted by the direct staging driver. The older observer launched without the configured client proxy had transport-only failures; those are not evidence of a production outage.

## Fresh backup, migration and recovery

After all four old writers stopped, two complete zero-writer/lease barriers passed. A **new** source backup and isolated restore succeeded at14:17:43.623, update `6ad777ebe06d5e1f79836e77`, attempt `production-358-host-20261020`. All173 table counts and schema provenance were equal; this is not a row-content-hash comparison. The verification database was removed; the actual source backup remains retained in the PostgreSQL volume. Dump SHA256: `bdd113312048a5f5b9d66e01473807a04776af4031039fe2836fa5719077e68d`.

Migration update `6ad77847e06d5e1f79836e91` succeeded in10.017seconds. Fresh state at14:19:08.195 confirmed3.5.8/native13/product48 and exact inventories. **Old native12/3.5.6 Workers must not be restarted after this boundary.**

WebA deployed successfully, but WebB's first deployment `6ad778a1e06d5e1f79836ea6` ended Complete/false during ComposePull with mirrorHTTP522, before ComposeUp. The engine stopped and read fresh target state. The existing accelerator later returned200 with the exact audited digest. A separate continuation preserved WebA and deployed only WebB, WorkerA and WorkerB. It did not explicitly resubmit the migration; existing Compose dependencies can run the idempotent migration entrypoint and education-plan transaction, so this is not described as a read-only deployment.

Two verifier assumptions were corrected with retained before/after evidence. The first continuation rejected the daemon's index-based ImageId before any execute action; the second bound actual per-host image identities and all22 audited layers. The first final acceptance expected the generic Node entrypoint; frozen d107 Dockerfile:133 and actual containers use `/usr/bin/tini --`. Only that check failed. Its correction reread production without restarting any service or repeating unaffected flows. Both failed artifacts and their SHA chains remain included.

The final collector contains **27 unique exact terminal updates:26 successes and the one explicitly retained522 failure**. Four successful service deployments and four successful source stops are accounted for. WebA's healthy target identity remained unchanged throughout recovery.

| Verified service health | UTC |
| --- | --- |
| WebA |14:20:01.637|
| WebB |14:31:01.061|
| WorkerA |14:32:03.163|
| WorkerB |14:33:07.123|
| Continuation complete |14:33:25.459|
| Final acceptance |14:36:35.332|

## Availability and limits

Public readiness last passed at14:16:30.321, first failed at14:16:35.811, last failed at14:19:50.238 and first recovered at14:19:55.543. There were36 failed samples; first-failure to recovery spans**199.732seconds**. Sampling does not establish exact outage edges. HTTP recovery preceded Worker recovery and does not establish authenticated conversation availability during that interval.

Authenticated production business/provider smoke was not run because no existing authorized smoke identity was injected; none was created or copied. The actual target Workers' production command, Tini entrypoint and native readiness checks support the source-based inference that shipped harmless bubblewrap/kernel startup checks completed. No additional production isolation fault-injection matrix or long soak was run. The paused fixed3.5.3 observation is untouched.

Host-file mode remains deliberate. Ordinary legacy rollout remains blocked until the separate guarded same-schema host-release path is qualified; switching blindly back to the broken Git checkout is not a cleanup step. The current Compose policy still contacts the existing accelerator and its transient522 risk is not eliminated by host-file staging. PR237 and remaining #229 cold/warm/peak-disk work are separate and are not claimed completed by this acceptance.

## Reconciliation

`production-host-final-acceptance.json` records18 checks and binds prior failed acceptance. `host-continuation-komodo-terminal-receipts.json` binds immutable original execution and v2 continuation bytes. `lingxi-358-final-evidence-independent-review.md` describes independent local reconciliation, including actual image layer and public asset comparisons. `SHA256SUMS` covers all evidence here. Operator scripts use absolute paths from the authorized environment and are evidence, not instructions to rerun production actions. No memory bodies or credential values are included.
