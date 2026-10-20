# Canvas237 release preparation independent review

Decision: **PASS for the exact public manifests and reviewed-driver identity**. The DB-free oneoff is acceptable in principle under the bounded contract below; its concrete implementation, frozen plan, target image audit and successful exact-target CI remain pending review. This report does not approve an unreviewed command or claim production execution.

## Frozen identities

- Product candidate: `9a5cfda82ad105d666bf0452df1d615daf6c6a28`.
- Accepted source image: `d1075e35e16721979b484c2d9e33eeb56468ce9d`.
- Source manifest: `f56db73dabbaec1e92a421bbad76c239ed8d1ae2`, `release/production-358-20261020`.
- Online pull manifest: `fe5ce1f468989d7604cf92fc7a7742b9ba9eaab0`, `release/canvas-pull-20261020`.
- Final never-pull manifest: `f70f6d46b39d65ad3c9aad2284db9c85a0cf3600`, `release/canvas-production-20261020`.
- Reviewed driver: `731482a1fd98ed781bb1346273ee63fe92fef9f7`.

The local branch refs match the two manifest IDs. Remote push, PR239 and running CI39443966923 are parent-provided context; this reviewer did not make network requests or independently certify their current status.

## Independent checks performed

Read exact Git blobs, raw diffs, file modes and commit messages. Compared all11 changed driver/transport/tests/docs/workflow files from the prior independent review against candidate9a5: every file is byte-identical, including the appended uncertain-classification fix. Both template commits retain `[skip deploy]` and use leecyang as author/committer. `git diff --check` passed. No implementation or template file was edited.

Independently ran the reviewed effective Compose parser with interpolation, environment-file resolution and path resolution disabled. For both app stacks, source→final permits only each of `db-migrate`, `lingxiloop`, `worker` image and pull_policy. The image is exact candidate9a5; the online preparation policy is always and final policy is never. Source→pull raw changes are just the runtime-anchor and explicit Worker image values. Pull→final changes are just the runtime-anchor pull policy.

AppB gateway is deep-equal in all three effective configs. Core Compose bytes are identical in all three commits. All other `deploy/komodo` files are unchanged from source manifest to final manifest. Effective environment, security, volumes, commands, ports, resource limits and dependencies are preserved. These conclusions concern public templates, not current live host bytes/configuration; those remain the release driver's online gates.

## DB-free Canvas/PDF oneoff contract

Use the public `RunStackService` API for the app stack's `db-migrate` service with `no_tty:true`, `no_deps:true`, `detach:false`, `service_ports:false`, `pull:false`, and a fixed command override. The target file must already be the exact audited never-pull template and the app policy must be qualified. The command must not invoke npm db:migrate, a product entrypoint, shell profile or any app/provider startup path. The frozen image ENTRYPOINT is tini, so this fixed command replaces the migration CMD rather than executing it.

The db-migrate service normally inherits DATABASE_URL. Start the isolated probe process with `timeout -k 5 30 env -i PATH=<fixed trusted system path> NODE_ENV=production node ...` (structured argument array, no dynamic shell). This clears environment only inside this transient process; no Stack config, credentials, .env or security settings are altered. Use a bounded Node heap, tiny fixed PNG and a698-byte public PDF. Capture parser output in memory and emit only one fixed marker with pass booleans, byte counts and SHA256 values; failures must emit a generic marker, not document text, native diagnostics or assertion objects containing raw buffers. No image/PNG/PDF/text body should be logged or persisted.

Prefer formally published LingxiOS3.5.8's public `extractDocumentText(bytes,'pdf')`, exported from the package root. It invokes the packaged real document-worker internally with an empty environment, bounded128MiB heap,10-second deadline and bounded input/output, avoiding a private dist-path dependency. Its PDF worker imports PDF.js, reads local packaged CMaps/fonts/WASM, and extracts supplied bytes; this fixed path does not construct a database or provider client. Calling the public function still tests the actual native document subprocess. Verify the concrete probe code has no URL fetch or external-storage reference; code-level DB/provider freedom must not be presented as a kernel-enforced network sandbox.

The known fixed checks are:

- Canvas: createCanvas(17,13), default2d fillRect(1,2,8,6), then PNG. Prior independently qualified output is115bytes, SHA256 `37bb849c8331759b4b7b6ec3e959f1e60b4b5bfbf9dcd4a4b711ae0c406ca5c0`. Verify GNU binding selected, musl binary absent and relevant retained license before accepting.
- PDF input: exact candidate Git blob `e2e/homework/triangle-reference.pdf`,698bytes, SHA256 `33aaa4a900cc81178a5c9c312bc0126b81805423e483e498a9c9b0d423c0a10e`. Only this public fixture may be embedded as fixed base64; it contains no user data.
- PDF output: known source/pruned-copy result201bytes, SHA256 `30ee46cdb0878604ece1e00fab7a9807f3db64ff443a48e6dc2fe4a5646a5e04`. Compare hash/length; do not log extracted text. These baseline expectations do not claim the not-yet-audited candidate image has passed.

Run sequentially on both actual app hosts after online target staging and before any Worker stop. Bind each run to the actual qualified target index/platform/layers/daemon image ID, exact refreshed host file/config and metadata. Compare the same original four container IDs/image IDs/running/health/restart/OOM state before and after. Require exact target Stack ID, operation RunStackService, Complete/success:true and GetUpdate reread for each receipt. Any accepted-but-unknown result blocks all subsequent requests, including retries or recovery guesses.

Do not externally stage the target and then start an untouched stock driver from source phase: it will correctly reject the changed source/hash. Use a separately reviewed integration wrapper at the online metadata/pre-stop boundary, retaining all existing guard/inventory checks and exclusive receipt ownership. The wrapper's exact source/hash and failure paths must be reviewed before execution. Existing Workers remain healthy through this qualification; no Stop/Deploy/DDL/backup is included in this probe itself.

## Limits and pending evidence

No production API, installation, image pull or image build was performed. The same-schema driver implementation remains approved at the earlier exactHEAD; this report only extends public-file identity proof to candidate9a5 and its templates. Image audits, concrete sealed plan and completed exact-target CI remain necessary. The oneoff is a narrow fixed-fixture native Canvas/PDF check, not authenticated business, provider, OCR, every CMap/font/WASM variant, production isolation or long-soak coverage. Do not reopen the legacy broad rollout.

## Evidence

- Reproducible local verifier: `/tmp/lingxi-237-manifest-review.mjs`, SHA256 `b9374e84b162676c55dbea3d4cee5b83c4856948a8442d40edadf7f8108fbe57`.
- Machine receipt: `/tmp/lingxi-237-manifest-review.json`, SHA256 `b68b82d32963a1a6d9ca981768c67bd9913e9f132169296d04d7638713340827`. Contains all11 driver hashes and exact per-stack template hashes.

| Stack | Source SHA256 | Pull SHA256 | Final SHA256 |
| --- | --- | --- | --- |
| lingxiloop-app-a | `4ad4d738a8f41d549412a71c4de8c78e5fb3f2c5365be86d5fa892db8877b050` | `ea8aa65cbbe86ffb3d1517e4b35da8b65a9a26109e265b9d9053764e45fc5dee` | `0396b9932f663a0ab22ed67a2686d3199d3ae1bbc4e11872f00b6db072d99ec7` |
| lingxiloop-app-b | `145ded6c585329317b54c2cca24e80870ab151d870a7c749bd2724dd852c5a26` | `7092fbf528a92821997f8cfd79f4491e9f0599a0f1a68d0306a1515e9df2a579` | `e3eb0cfdc5490a6f09c37421b9f7164c1a03372c795c1dcd5abdc0555ebab109` |
| lingxiloop-core-state | `dda3dd16ff30968905f2083d271a28d12e1519f713ce46a7fead19a02ce82dab` | `dda3dd16ff30968905f2083d271a28d12e1519f713ce46a7fead19a02ce82dab` | `dda3dd16ff30968905f2083d271a28d12e1519f713ce46a7fead19a02ce82dab` |
