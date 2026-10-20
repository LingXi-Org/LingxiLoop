# Canvas237 native probe and release wrapper independent review

**PASS for the exact revised local implementation below. No remaining P1/P2 finding.** This is a pre-execution code review, conditional on successful exact-candidate CI, image audits and the separately reviewed sealed plan. No production request, image pull/build, installation or persistent configuration change was performed by this reviewer.

## Bound implementation

- `/tmp/lingxi-canvas-release-20261020/native-image-probe.mjs` — SHA256 `4598e58432b283a54bb916d622c19f8c34d7c317e808d4b03b1f94d482b16e43`.
- `/tmp/lingxi-canvas-release-20261020/probe-before-drain.mjs` — SHA256 `3d60fde86394020726414b961ce175806402a7d28a5cce68811fa7af55054a6b`.
- `/tmp/lingxi-canvas-release-20261020/run-canvas-release.mjs` — SHA256 `0016cf15f6c22db4e67e372856f8d6b7d10b91294e0fe66164ad75ce4fedd08c`.

The wrapper actually imports `/workspace/LingxiLoop-maintenance-host-source/scripts/{host-release,host-release-komodo,schema-upgrade-komodo}.mjs`, with the public Compose helper imported transitively. That worktree was clean at candidate `9a5cfda82ad105d666bf0452df1d615daf6c6a28`. Independently recomputed all four file hashes against the reviewed731 receipt: identical. The new wrapper fixes source d107 and target9a5, uses the stock offline plan/audit/acceptance validators, creates a new exclusive receipt and preserves signal cancellation and the stock engine.

## Boundary fix verified

Initial hook relied solely on `transport.execute`. The stock transport can return an already-Complete acceptance directly, so an explicit GetUpdate reread was not guaranteed. The reviewer required this boundary to be closed before approval.

The final hook validates the accepted exact24hex update ID, RunStackService operation, Stack target, Complete and success:true, then explicitly reads that same GetUpdate. It compares the ID, operation and full target and again requires Complete/success:true before using the marker. The stock transport independently resolves the real Stack ID before execution and validates that identity at acceptance/completion. Any invalid accepted identity, unreadable reread or contradictory terminal receipt is marked uncertain; no after-inspect or later request occurs. The stock engine propagates uncertainty and does not attempt recovery classification in that case.

Tests were expanded before this correction; the saved red log has6 cases with3 failures. The reviewer independently reran the final existing contracts: **6/6 PASS**. Coverage includes ordered success on both apps, duplicate/unexpected target rejection, wrong source before execute, unknown execute with no follow-up, wrong marker rejection, container replacement, and unreadable/contradictory GetUpdate with no follow-up. All three executable scripts also passed Node syntax checks. The initial5/5 result is retained separately and is not substituted for the revised6/6 result.

## Safety and correctness checked

- The hook wraps each stock target metadata operation. In the engine, both app sources have already staged before these metadata calls, and every Stop occurs only after both return and the stock online state/original-inventory checks succeed. Existing Worker and Web identity protection remains in the stock engine. The hook additionally checks four distinct source containers healthy/running/restart0 and compares its full four-container snapshots byte-for-value before/after each probe; strict real ops.inspect also rejects OOM and protected environment/security/mount/startup drift.
- Before the probe it runs native source/config/idle guards and actual target image qualification for that stack. It uses only public RunStackService for db-migrate with no_tty:true, no_deps:true, detach:false, service_ports:false and pull:false. The staged effective template has pull_policy:never; no npm migration command or app entrypoint is run. The image's unchanged tini ENTRYPOINT executes only the supplied command.
- Command arguments are fixed: timeout -k5 30, env -i, fixed trusted PATH and NODE_ENV, then Node with a128MiB outer heap. Thus the normal db-migrate DATABASE_URL is not inherited by Node. There is no persistent env/config/security update. The public extractDocumentText child uses its own empty environment,128MiB heap and10-second bound. The fixture is tiny and unchanged service resource limits remain512MiB/0.5CPU.
- The probe uses `extractDocumentText` from the formal public LingxiOS package root; it does not import private runtime paths or start the service, database or provider. Exact known PDF bytes are passed directly. This is code-path DB/provider freedom, not a claim that the container has kernel-enforced network isolation.
- The embedded PDF was independently base64-decoded and compared byte-for-byte with candidate9a5 `e2e/homework/triangle-reference.pdf`:698bytes, SHA25633aaa4a900cc81178a5c9c312bc0126b81805423e483e498a9c9b0d423c0a10e. Canvas draws17x13/fillRect(1,2,8,6), requires115bytes and known PNG hash, verifies GNU native selection and musl binary absence. Public document extraction requires201bytes and the known PDF output hash.
- The probe emits only a fixed structured success marker with booleans/counts/hashes. The hook requires exactly one bounded marker and deep equality with the expected object. No raw PNG/PDF/output document/config/env/provider response enters progress. Runtime failures inside the probe emit only a fixed failure marker. Native command logging contains fixed public source/fixture, not credential values.
- RunStackService unknown results and terminal reread ambiguity immediately stop. A known unsuccessful probe/hash/container check may trigger only the stock engine's one read-only compatibility classification; it cannot stop/deploy or automatically rerun the probe. Known/unknown classification from the stock reviewed engine is retained.

## Limits before execution

The wrapper/hook approval does not prove the future target OCI image has passed this native check; the parent-reported local task-copy PNG/public-API run is not an OCI or production receipt and was not rerun in this review. The concrete image audit and sealed plan were not yet supplied. The parent must retain sole execution ownership, recheck these exact script hashes and the immutable target/source evidence, and require successful exact-target CI before starting. Actual live host source/config/image/DB checks remain enforced by the stock driver.

The final native probe receipts must retain their update IDs and terminalReadback:true. Public HTTP/version/readiness/asset acceptance still follows the rollout. One small public PDF does not prove OCR, every CMap/font/WASM path, authenticated business/provider behavior, full isolation or long-soak durability. The existing3.5.3 observation stays untouched.

## Evidence hashes

| Artifact | SHA256 |
| --- | --- |
| `/tmp/lingxi-canvas-release-20261020/native-image-probe.mjs` | `4598e58432b283a54bb916d622c19f8c34d7c317e808d4b03b1f94d482b16e43` |
| `/tmp/lingxi-canvas-release-20261020/probe-before-drain.mjs` | `3d60fde86394020726414b961ce175806402a7d28a5cce68811fa7af55054a6b` |
| `/tmp/lingxi-canvas-release-20261020/run-canvas-release.mjs` | `0016cf15f6c22db4e67e372856f8d6b7d10b91294e0fe66164ad75ce4fedd08c` |
| `/tmp/lingxi-canvas-release-20261020/probe-failure-model.md` | `4b06d2c94d24c2b34e0505a43929bba29d8c8b1fdd2e01d55080f2bf17174eca` |
| `/tmp/lingxi-canvas-release-20261020/probe-before-drain.test.mjs` | `9d777f8f9aa09366a8626505a7f9984716e68285e572cb520a824392e3f5f2b0` |
| `/tmp/lingxi-canvas-release-20261020/probe-reread-red.log` | `03000ba4691d98871a108a3635d1e02ab35e6594cd47741e13e50f733f75168b` |
| `/tmp/lingxi-canvas-release-20261020/probe-reread-green.log` | `48d485519a8544757daa7d51b72ecc2d0821f30c396926e43775de1f9e3916f1` |
| `/tmp/lingxi-237-probe-reread-independent-green.log` | `3ec3adbe9226f0062164d6ddb94c86162410611f95efb86f0555e673eebd011b` |

Machine binding: `/tmp/lingxi-237-native-probe-independent-review.json`, SHA256 `20ee03bf1a9f49de4e87a10cef490b1df81cedfb4e29eba49694ed689c854181`.
