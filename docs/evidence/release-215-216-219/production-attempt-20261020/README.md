# Production maintenance attempt and compatible service recovery — 2026-10-20

**Outcome: the target upgrade was not deployed. Production was restored to the original compatible release.** All times below are UTC. This record supersedes any earlier statement that the release was merely awaiting deployment authorization; the user authorized the disclosed maintenance, it was attempted, and preparation failed before migration47/48.

The final recovery acceptance at13:22:00 confirms actual source `ac9069460e99a20fac7f2c3de87c60f2bec66924`, formal runtime3.5.6, native schema12/protocol11, product migration46 and all46 exact SQL checksums. The original four distinct Web/Worker containers retain their image identities, restart counts and observed policies, and are healthy. All three required hosts are healthy. Four public routes return200 and the public version metadata matches the pre-maintenance baseline. Four exact Komodo `StartContainer` updates are terminal `Complete / success:true`.

The temporary application configuration was restored at13:22:52: both applications again use their original `main` branch / commit `5d00ad7e379d82ea8b5ab35c10af775b155717f2` and `reclone=false`. The configuration writer compared full before/after configurations in memory, confirming only those two fields changed, and then verified the same four healthy containers. No environment, credential or security configuration was changed. Full secret-bearing configurations are not retained.

## Qualified target remains unchanged

- Product candidate / PR236: `d1075e35e16721979b484c2d9e33eeb56468ce9d`.
- Target runtime3.5.8 / native13 / product48; exact-head CI39412540194 and publish-only39413726289 succeeded before maintenance.
- Qualified OCI index `sha256:697d5a3e3d34629e603c120cd068abde3a2add611f583d5444d77a947887bf69`; amd64 `sha256:1c437ff4f2b2f36055fddcf179460963d9f95147406989b48355a0020e4bf862`; config `sha256:019d5728f0ef708fe9a642eaf1effd2c12699cdb303e2206e11b55e542fb2c4b`.
- Temporary deployment-manifest commit `f56db73dabbaec1e92a421bbad76c239ed8d1ae2` only pinned the qualified image. It remains on its release branch, not main.
- The previously frozen image qualification evidence is commit `1d69936d6b4079d8628ccd83688fa0a960179a14`, under `../image-final/`. No replacement image was built during maintenance.
- No product PR/main merge, issue closure, PR237 deployment, or modification of the paused fixed3.5.3 soak occurred in this maintenance attempt. #229 remains open.

## Actual execution and failure boundaries

1. Two pre-downtime preparation attempts failed safely: the first image pull returned mirrorHTTP522; the next reached a missing-Compose-path error after Git preparation failed. Neither attempt stopped services or submitted DDL. A subsequent manifest read verified the same qualified immutable image.
2. Temporary `reclone=true` repaired the owned application checkout path sufficiently for both target image pulls and an initial DB-free metadata check to succeed. This setting removes/reclones only Komodo's owned checkout; the production mounts were inspected beforehand. It did not alter Docker volumes or databases.
3. Four old writer containers were stopped and their exact identities verified. Two full writer barriers were empty. An actual snapshot-consistent production backup and isolated restore completed successfully, described below.
4. A repeated DB-free metadata operation, update `6ad76383e06d5e1f79836a3a`, started12:50:11.584. The local engine stopped waiting after seven minutes and retained the unknown outcome. It was **not** restarted or resubmitted. Read-only process samples showed the same host `git clone` and pack processes still active, with disk writes112–176KB/s. No metadata or migration process was observed in those samples.
5. That update ultimately became `Complete / success:false` at13:08:50.755. The retained error reports that the application checkout directory could not be canonicalized because it did not exist. The Compose metadata command did not start. Komodo did not preserve the underlying Git error in that task response, so the precise cause of the clone failure is not established. The failure was in deployment preparation, not evidence of a database or model fault.
6. Fresh read-only database evidence at12:58:32 and13:12:15 confirmed source3.5.6/native12/product46 with all writer barriers zero. **Neither migration47 nor48 was submitted.** The old-version prohibition after47 therefore never became applicable, and exact compatible-source restoration was authorized and reviewed.
7. Exact existing containers were started using Komodo's supported `StartContainer` operation, avoiding the failed Git checkout. WebA recovered first. Before WebB, another read-only core-state oneoff failed before SQL with a missing root Compose path. Its failure was terminal; a separate fresh read succeeded at13:16:34. The original partial recovery receipt was preserved. A reviewed continuation confirmed the successful WebA update, skipped only WebA, and recovered the remaining three original containers.
8. Each old-container start was preceded by a fresh exact-source schema check. Each required its own terminal update and actual container health. Final source-state and complete four-container verification passed at13:20:31. Independent read-only postflight and acceptance then passed, followed by configuration restoration.

## Backup and restore evidence

Backup update `6ad76354e06d5e1f79836a2f` completed successfully; verified receipt observed12:49:57.198. The restore had equal row counts across173 production tables and equal schema/runtime/migration provenance. This is a count/provenance comparison, **not a row-content hash comparison**. The isolated verification database was removed after verification; the actual backup remains in its original PostgreSQL volume.

- Dump SHA-256: `27a3fc7a9bf6f7bdf3f270f256f635ed5a71d62ee8a825a9a0b2a2d3c6778034`.
- Backup command hash: `461248bf7b999ca5cf538748cc30ba0ac545396f63489469f5a97883bde3bb0b`.
- Source database bytes:792,689,687; measured free bytes before restore26,506,493,952.
- Retained backup directory: `/var/lib/postgresql/data/memory-upgrade-backups/ac9069460e99a20fac7f2c3de87c60f2bec66924/production-358-20261020-1201`.
- Backup source is runtime3.5.6 / native12 / product46. Since source service resumed, this backup is historical and **must not be treated as a fresh drain-bound snapshot for a later upgrade**.

## Availability observations

| Observation | UTC |
| --- | --- |
| Last successful public readiness sample before maintenance |12:48:48.018|
| First failed readiness sample (502) |12:48:54.534|
| Last failed readiness sample |13:13:52.863|
| First recovered readiness sample (200) |13:13:58.173|
| Original WebA healthy |13:14:08.681|
| Original WebB healthy |13:19:07.210|
| Original WorkerA healthy |13:19:44.497|
| Original WorkerB healthy |13:20:15.706|
| Final recovery accepted |13:22:00.586|
| Original temporary configuration restored |13:22:52.102|

The first-failure to first-recovery readiness samples span1,503.639seconds (about25minutes4seconds), with278 failed samples. Request-start sample brackets are1,498.329–1,510.155seconds; these are sampling bounds, not exact outage edges. No further failed readiness samples occurred through13:22:50. Readiness returned before the Workers were restored; it does **not** establish authenticated chat availability over that interval. Full four-container health was restored later as shown above.

## Evidence and limitations

`source-recovery-acceptance.json` binds the immutable prior execution receipt and both recovery receipts, compares exact original containers/images/policies, full database provenance and public metadata. `source-recovery-terminal-receipts.json` records14 terminal updates with exactly four successful starts and the two explicitly expected preparation/read failures. `source-config-restoration.json` records each configuration write and verified readback. Earlier failed and uncertain observations are retained, not rewritten as successful outcomes. `SHA256SUMS` binds every included evidence file.

Authenticated production business smoke remains **not run**: no existing authorized smoke cookie/company identity was injected, and none was created or copied. Existing preproduction qualification is not claimed as production business acceptance. No production fault injection, data reset/restore, broad prune, credential creation, or security change was used.

The outstanding release blocker is reliable Komodo-owned Git checkout preparation. A scoped existing-release-branch/incremental-fetch approach was independently reviewed but **not executed** after this attempt's metadata check failed; the prepared continuation's success precondition is deliberately unsatisfied. Before another maintenance window, repair and verify checkout preparation while services remain online, reconfirm exact qualified image/metadata and current main, then create a new drain-bound backup plan. Do not reuse the original stopped-writer evidence or backup as current. If47 commits in a future attempt, old3.5.6 must never be restarted; use compatible fix-forward or an explicitly verified data-preserving restore.
