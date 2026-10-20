# Canvas release acceptance correction and offline qualification

2026-10-20. Only `collect-terminal-receipts.mjs` and `verify-final-acceptance.mjs` were edited, as delegated. Application candidate 9a5cfda82ad105d666bf0452df1d615daf6c6a28 and public operations worktree remain unchanged. No production/network/API/provider/browser/Docker operation ran. Parent owns the reader/asset script and all execution.

## Findings corrected

- P1: Boolean-only source/Canvas acceptance could reuse an unrelated successful old report. Both now bind exact target/source identity, actual source-check field names, audited index/platform/config where applicable, raw audit receipt hash, raw inventory hash and formal sealed plan. Canvas path is `canvas-check/canvas-check.json`.
- P1: Asset success booleans were not linked to the qualified inventory. Final acceptance requires the parent's receipt sourceCommit/indexDigest/auditReceiptSha256/inventorySha256 and rechecks each public path's actual hash, decoded length, content type and index/JS/CSS coverage against the raw audited inventory.
- P1: Operation totals did not prove exact ordered service actions or probe correspondence. Collector now enforces serial submitting/pending/complete one-to-one pairing; exact per-stack preparation/release sequence; two Worker stops; WebA, WebB, WorkerA, WorkerB deployments and final container IDs; two native probes before the first actual Stop submission, with exact terminal identity and known synthetic output. Every GetUpdate must be Complete/true with finite ordered timestamps. Missing/duplicate/failed/uncertain events fail closed.
- P2: WriteStackFileContents request has native terminal enum `WriteStackContents`, not `WriteStackFileContents`; corrected against the public Komodo transport implementation.
- P1: Host/source/image checks previously allowed cross-host image matching and loosely matched containers. Current checks require each exact stack/server/service/container, original source identity retained through preparation, final target IDs matching deployment markers, actual per-host qualified ImageId, exact mirror RepoDigest/platform/ordered diffIDs and optional descriptor identity. No fixed config/index ImageId assumption remains.
- P1: SQL state was trusted only as a copied final object. All known state GetUpdates are parsed as exact native read-only state receipts and must retain source/target same formal runtime/native13/protocol/schemaHash/full48 inventory. Final state must be the last release terminal and match the driver's complete state after all deployments. No new SQL or execute operation is introduced by the collector.
- Freshness: current postflight must start after release completion; capture finish must precede acceptance and be within15minutes; assets and terminal collection must start after completion. Latest final host-source hashes and actual qualified image events are checked, plus current server/stack idleness. This is bounded evidence freshness, not a claim of atomic production snapshot or continuous monitoring. All evidence raw hashes are emitted in final acceptance.

## Red and green

`FAILURE-MODEL.md` preceded edits. Original scripts are retained as `collector-before.mjs` and `verifier-before.mjs`.

`legacy-red.test.mjs` evaluates the exact original check assignments with stale successful source/Canvas reports and original native operation mapping. All3 expectations fail as intended; `red.log` is retained. No network or script top-level operation is invoked.

`acceptance.test.mjs` drives the actual public `runImagePreparation` and `runHostRelease`, with the actual private `attachNativeProbe`, through local synthetic operations. It produces the same serial event contract and validates all36 native terminal updates: preparation8 plus release28; Pull2, Write6, Stop2, Deploy4, core state18, metadata2, native probe2. Production GetUpdate data is not fabricated: these fixtures are explicitly synthetic and never used as production receipts.

Final Node22 run: **28/28 passed**, zero failures/cancelled/skipped, 241.689ms. Cases cover an accepted full chain; legal index-based and config-based per-host daemon ImageIds; stale source/Canvas reports; mismatched audit/inventory/asset bytes; current container/service/server drift; rootfs mismatch; stale capture; schema divergence; missing/failed terminal; native output mismatch; wrong Stop service; source policy drift; duplicate/unresolved progress; explicit failed/uncertain outcomes; probes occurring after actual Stop submission; duplicate deployment service markers. Both scripts also pass `node --check`.

The exact36 count is intentional for the frozen reviewed engine and this two-probe wrapper. A future engine adding/removing state calls will require a reviewed collector delta, not a silent count relaxation. Service identity is bound through the reviewed engine's service markers plus actual resulting container identity; native GetUpdate uses the service operation enum and Stack target, not a fabricated nonexistent service field.

## Final file hashes

- collector: `0a2f0754f4ef31f410a3d7089753a551cba27934d0345c0628ba88a10376eacc`
- verifier: `e80eb3cd33295954b9c9a22053c7312e43e44f2145ffe819506e5ded34897e69`
- red.log: `8af259e37d7754f4e9b9d06cdb4983c8be1fdf80bfb6fb1c4c8073c8ab93ef8d`
- green.log: `4ba2da5b2cad155e932eca9d51355b573156a1c29280f192ff0ac9c2a771740a`

## Handoff and remaining boundary

Ready for parent's independent local review. This is not a production acceptance result: real plan, audited target artifacts and production reads/terminal receipts must be supplied by the sole executor. Collector never resubmits or executes operations. It reserves an exclusive output file and retains a non-success result on read/validation failure; the verifier writes an exclusive result with per-check booleans and never accepts missing input. Failed/unknown evidence requires review rather than retry-to-green. No credentials or raw native logs are persisted. No operation was denied, pending approval, or left with an uncertain execution outcome by this child.
