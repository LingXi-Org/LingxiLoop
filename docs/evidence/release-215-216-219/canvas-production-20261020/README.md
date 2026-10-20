# Accepted Canvas image release — 2026-10-20

Production acceptance at **2026-10-20T15:45:47.705Z**: **16/16 checks passed**, all **36** exact native Komodo updates Complete/success. Four actual target services are healthy, restart0/OOMfalse;3hosts connected; security/environment/volume/startup policy unchanged. Public health/dependencies/meta and audited HTML/entry JS/CSS match. This supersedes accepted d107 application image; it does not replay native or product migrations.

## Exact delivered source and image

- App source / PR239 head: `9a5cfda82ad105d666bf0452df1d615daf6c6a28` (`release/canvas-host-20261020`). Original Canvas PR237 commit and public same-schema host release commits are retained by normal merges.
- Runtime: formal `@lyyzka/lingxios@3.5.8`; protocol11/native13/product48. All48 migration checksums and formal schema identity retained.
- Image index / actual per-host Docker ImageId: `sha256:9c6753001d1561db46c45a00e6cbdfa2fceae304454f7da3c84c4e981ffb1b08`.
- amd64 manifest: `sha256:ba154cf9ba046cbe977a88067d9d56074f37f09544c99b5a56cf08bcb6aca2cc`.
- Config: `sha256:80c5e5ce9f7c0b20b06ae3ec9c0512bc2f8976572f7cab81a6de4c1f45c5fa6a`. Config digest is not assumed to be the daemon ImageId.
- Final app host template commit: `f70f6d46b39d65ad3c9aad2284db9c85a0cf3600`, branch `release/canvas-production-20261020`, files_on_host true, auto_pull false, exact `--no-deps --pull never`. Core remains accepted `f56db73dabbaec1e92a421bbad76c239ed8d1ae2` and unchanged.
- Publication CI39443966923 and PR CI39444057773 both succeeded at exact9a5. Publication took308s; build/push step249s. Deployment/manifest/legacy-rollout jobs were explicitly skipped. Production was executed through the reviewed public host release driver.

## What changed and what was actually measured

The only Canvas payload deletion is `app/node_modules/@napi-rs/canvas-linux-x64-musl/skia.linux-x64-musl.node` (30,315,608 regular-file bytes). All18 retained Canvas entries match baseline. Formal runtime474 files, PDF379 files,521 copied source paths and48 migrations match;22 OCI layers were streamed and audited without pulling/extracting a local image.

Actual compressed OCI layers: **205,959,232 →192,937,300 bytes** (−13,021,932; **−6.3226%**). Expanded tar totals: **618,504,704 →588,190,208** (−30,314,496; −4.9013%). These are actual image measurements, not a cold/warm build or peak-disk experiment. Do not turn the earlier estimated gzip reduction into the measured OCI number.

Both production hosts ran the exact candidate through the native public PDF extraction API and a public synthetic fixture before any old Worker stop. Both selected GNU/glibc, proved musl absence, and produced the same115-byte PNG/hash and201-byte PDF-text-output/hash. Only hashes/counts were logged; no memory, production document or credential was included.

## Execution and availability limits

Online image preparation15:25:38.431→15:35:25.037 restored both original templates and kept all4original services healthy. Release15:36:15.950→15:43:55.586 used local qualified images,2Worker stops, repeated zero-lease barriers, then WebA/WebB/WorkerA/WorkerB.36terminal receipts comprise8preparation plus28release operations, including2native probes.

Readiness observer:359samples from15:12:38.760 through15:45:47.068, **0failed samples**. This is approximately5second public `/readyz` sampling, not continuous uptime or authenticated conversation availability. Old Workers stopped15:39:18.452/15:39:36.439; new Workers became healthy15:42:47.100/15:43:36.191. Do not claim absence of foreground/background task queueing during drain.

Exact Tini entrypoint, Worker command and native5190/readyz health imply completion of shipped startup self-checks. No production fault injection/full isolation matrix was run. Authenticated production smoke was not run because no existing authorized identity was injected; no identity or credential was created/copied. The prior fixed3.5.3 durability observation remains untouched. Core-state SQL one-offs still retain their existing image-source/registry dependency; only app rollout is qualified cache-only.

## Reproduction and retained evidence

`final-acceptance.json` hashes every input used by the verifier. `terminal-receipts.json` binds exact IDs/operations/Stack targets and actual metadata/schema/probe outputs. `production-after.json` is a fresh16API-read capture with0write/execute/SQL/provider operations. `image-audit/rootfs-inventory.json.gz` is a deterministic gzip of the exact raw inventory; decompress it to `rootfs-inventory.json` and verify its raw SHA against the audit receipt before using the checker. Operator scripts retain original absolute paths to make the executed environment explicit; restore the documented evidence paths or deliberately adapt paths when reproducing offline validation, never substitute production facts.

The original failed d107 maintenance/recovery history remains in the preceding production-host evidence; this successful release does not overwrite or recategorize it. PR240/browser minimal acceptance and #217 generated-content quality are independent follow-ups coordinated by the parent. #216 initial real25legacy/40index backlog evidence and its public authorized maintenance receipts are separate from this image acceptance.
