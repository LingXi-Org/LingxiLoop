# Issue216 production memory migration and index acceptance

Production source9a5cfda82ad105d666bf0452df1d615daf6c6a28, formal runtime3.5.8/native13/protocol11/product48. The previously missing production content/index maintenance evidence is now available. This does not substitute schema47/48 success for content backfill.

## Observed data and authorized result

The initial strict READ ONLY / REPEATABLE READ count found63memories:25active legacy learner/course continuity candidates,15intentional non-continuity legacy records,40active non-evolved index candidates missing any current-version embedding. All25 continuity candidates required public authorization; they were not assumed eligible. See the earlier remaining-acceptance-20261020 evidence.

The public API inspected all25existing source identities and all25original continuity records.5unique records were eligible (3learner,2course).20continuity records lacked proven ownership/audience and remained isolated.15agent_role records were intentionally not promoted into stable continuity domains. No replacement identity, grants, run, caller-supplied fence or credentials were created/copied.

One successful execute moved exactly5original records into stable domains: the same25original IDs account for5stable+20legacy,0missing/deleted and0other-scope. All records were re-inspected afterward;0eligible legacy records remained under the existing authorization.35legacy records remain isolated, consisting of20continuity+15role records. The migration-stage27scanned/22isolated subset must not be confused with the complete after-scan35.

11authorized scopes queued20index jobs. At execute completion, doctor still reported0indexed/20missing; that receipt was explicitly not index completion. A subsequent status-only invocation, after existing Workers handled the work, reports31authorized/configured scopes,20eligible records,20current-version indexed,0missing. It performs no migrateLegacy or reindex call. Global index coverage is not claimed: inaccessible legacy records were not forced into indexing.

## Native receipts and lifecycle

| Operation | Native update | Native duration | Public/reference calls | Result |
| --- | --- | ---: | ---: | --- |
| v2 inspect |6ad7908be06d5e1f798373a2|27.751s|147|Complete/success,5eligible |
| v2 execute |6ad790f0e06d5e1f798373b5|46.292s|225|Complete/success,5migrated,20queued |
| v2 status |6ad79172e06d5e1f798373d1|11.084s|106|Complete/success,20indexed,0missing |

Each invocation has exact terminal reread, fixed aggregate schema validation, all3cleanup stages confirmed, and before/after guards proving the same4healthy production containers,3configuration hashes and3Compose hashes. No production fault injection, schema replay, configuration/volume/security change or frontend restart occurred.

The initial v1 inspect had full application output but nativeComplete/false after180.739s. It performed no content migration/reindex. Its code, original output, independent failure review and production health/policy readbacks are preserved under inspect-v1. The script omitted the business Redis/sub disposer and reported final before cleanup. V2 follows the existing product shutdown path, waits for both Redis clients to end, gives each cleanup stage a bound, and emits final success only after all cleanup succeeds. There is no forced process.exit. This is a maintenance-process lifecycle finding, not attribution of the original conversation memory-recall delay to Redis.

## Scope and reproducibility

V2 code d7eeed3847179f28538625e1a5bd19df295ed33f4a85692cfd87e471afae9c34; schema43a3ac87b2e4df02a738c80f77c8a861b8c641d9ff85a88afe35f129e85a343c; root wrapper6863fa29c1ac61646fc885255da8614fda179d1bb3277fead285ff2c380c2a15. Frozen source, schema, approval, failure model, meaningful red/green tests and native receipts are included. Local14/14independent checks and64synthetic schema events passed; actual results above come from production native receipts, not synthetic tests.

The remote program uses formal public memory APIs and existing product source bindings. The root wrapper uses the existing authenticated Komodo/Sigillo path and one-off existing app service without extra environment or permissions; original artifact paths are recorded in the wrapper. New execution must use a fresh output namespace and revalidate current accepted production policy. It is not safe to replay old receipts as current authorization. Native dryRun can lock/create scope bookkeeping and must not be labelled strict SQL read-only.

Maintenance bounds are64source identities,8pages per identity,512public/reference calls,130scheck-before-call budget and180sexternal process limit. Before actual migration, the observed plan required398remaining calls against421available; the real execute used225total. Later scope growth can still cause a bounded partial stop. Confirmed migration/queue progress is retained on failure and there is no automatic mutation retry.

Only aggregate counts/fixed metadata are published. No memory bodies, private source identity IDs, provider settings or credentials are logged. Prior formal provider, isolation, revocation/forgetting, restart and budget qualifications remain in the linked issue216/formal358/restore evidence; this receipt does not claim a new authenticated production conversation smoke or long soak. Fixed3.5.3 observation was untouched.

The product memory:maintain CLI has the same missing business-Redis shutdown pattern; a separate minimal source fix is being prepared. This successful bounded operator program already includes and verifies that correction. The CLI fix does not require replaying this completed content migration.
