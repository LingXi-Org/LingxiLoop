# Independent fallback review: native host file write without Git

Reviewer: `/root/host_preparation_review`, 2026-10-20. This is public-source and local-file research only. No production/API request, host command, config write, credential access, service action or deployment was performed. The currently pending production clone must reach a known terminal state before the parent can apply any alternative; this reviewer did not query it.

## Decision

**The proposed fallback can reconstruct the three exact public Compose files at their existing owned run directories and then use host mode without any Git clone/pull, including Core cache refresh.** Komodo 2.3.3 exposes this as `POST /write/WriteStackFileContents`. It is suitable for the authorized recoverable deployment-structure repair, subject to the preconditions and readback gates below. This is a source-contract finding, not proof of successful production execution or review of a not-yet-written fallback driver.

This removes the need to retry the failed repository clone. It does not remove registry checks/pulls, native environment-file writes, Docker or database dependencies.

## Exact dependency and file semantics

Komodo tag `v2.3.3` Cargo.toml and Cargo.lock select `mogh_secret_file` **1.0.1**. The published crate was downloaded anonymously from:

`https://static.crates.io/crates/mogh_secret_file/mogh_secret_file-1.0.1.crate`

Its SHA-256 exactly matches Cargo.lock:
`713d8731c78a3b867d712e394cef4be52b278e45aeca4b80ceb41b08d1c32334`.

Verified artifact and extracted sources: `/tmp/host-review-mogh-secret-file/`.

`write_async`, `src/write.rs` lines 39–64, performs:

1. `tokio::fs::create_dir_all(path.parent())`. Missing checkout root and all missing parent directories are created recursively. It does not require `.git`, an existing checkout, or a preexisting run directory.
2. `OpenOptions::new().write(true).create(true).truncate(true).mode(0o600).open(path)`.
3. `write_all(contents)` then `flush()`.

Consequences:

- A newly created Compose file requests Unix mode **0600**, subject to the process umask. No chmod/chown follows. The creating Periphery process owns it under normal filesystem creation rules.
- An existing file is truncated and overwritten **without changing its existing ownership or permissions**. `mode(0600)` applies only to creation. It is incorrect to claim the API chmods every existing file to 0600.
- Parent directory permissions are the normal recursive-create defaults and process umask; the library does not explicitly chmod existing or new parent directories.
- The write is **not atomic**: no temporary-file rename, transaction, backup or rollback. A failure after open can leave an empty/partial Compose file. `flush()` is not `sync_all()`/filesystem durability proof.
- The open does not use `O_NOFOLLOW` and the path is not securely canonicalized; existing symlinks can be followed. The API itself is not a path sandbox. The driver must use only literal approved stack names, unchanged known-owned run directories, and relative `file_path: "compose.yml"`; no caller-supplied absolute paths, `..`, or alternate files. If actual path ownership/symlink status is in doubt, resolve that with a read-only host check before writing.

A Rust runtime execution of the crate was not performed in this review (no rustc/cargo was available on PATH). The findings above are based on the exact checksum-verified published source, not a simulated filesystem test.

## Komodo public API path

Request shape from `client/core/rs/src/api/write/stack.rs`:

```json
{"stack":"lingxiloop-app-a","file_path":"compose.yml","contents":"<exact public Git blob bytes as UTF-8>"}
```

The API requires stack **Write** permission (cache refresh requires Execute). A permission denial must be reported; do not change accounts or bypass it.

`bin/core/src/api/write/stack.rs`, lines 182–319:

- Reads the named stack and checks Write permission.
- Creates an update with operation **`WriteStackContents`** and Stack target.
- Adds a log containing the complete submitted file contents before writing. Therefore only the public, unexpanded Git template may be submitted. Never pass generated `.env`, interpolated config, credentials, memory data or runtime logs as contents.
- If `files_on_host == true`, calls the native host writer directly. Otherwise it invokes the Git writing/commit path; **host mode must already be read back true before this request**.
- The host writer uses the configured stack name/run-directory and supplied relative file path, calls Periphery, then refreshes the stack cache. It finalizes and persists the returned update. Failure logs result in a completed unsuccessful update.
- A successful file write is followed by `RefreshStackCache`, which uses the host reader in host mode. No Git token lookup/clone/pull/commit is in this host write branch.
- It then asynchronously invokes `CheckStackForUpdate` with `skip_cache_refresh=true`. With `auto_update=false`, the update-check function returns before DeployStack. Neither `auto_pull=true` nor `auto_update_all_services` alone overrides that guard. There is no pre/post-deploy hook call in the host file writer.
- The asynchronous check can still inspect image digests and create update-available alerts, even with auto-update disabled. Do not claim it is free of registry queries or all control-plane side effects.

`bin/periphery/src/api/compose.rs`, lines 168–211, constructs:

`periphery.stack_dir / compatible-stack-name / existing-run_directory / compose.yml`

then calls the verified `mogh_secret_file::write_async`. It does not write environment contents or alter stack configuration. Host mode's later normal service operations still use the existing native environment writer to write the same `.env` from unchanged Komodo configuration; do not confuse that normal operation with this public-template-only write.

## Mandatory execution preconditions

1. Resolve pending clone `6ad7723fe06d5e1f79836d40` to a known terminal receipt first. Do not write while it can still remove or populate the owned directory. Do not restart the previous preparation script or launch a second clone. Check all three stack action states and the rollout procedure are idle, and retain sole-executor discipline; WriteStackFileContents itself does not supply a general stack action lock around this file update.
2. Reconfirm original four ac906/runtime3.5.6 services remain healthy with original identities/images/restart counts, source DB remains native12/product46, and no migration has been submitted. Preserve the prior backup and all old receipts.
3. Use exactly the three existing stacks and host IDs, empty clone path, same `deploy/komodo/<stack>` run-directory, exactly `['compose.yml']`, same `.env` path, no linked repo/inline source/extra dependencies/swarm/hooks/wrapper/bind mounts, and disabled auto-update. Inspect full before/after configs only in memory, with no environment/credential serialization.
4. Select `files_on_host=true` and `reclone=false` in a narrow reviewed config update. Branch/pin may be set to the known release/f56 values for provenance, but those fields do not determine actual files in host mode. They cannot substitute for content checks. Read back the complete expected config before any file write. Since host mode is already selected, no Git-backed preparatory operation is needed.
5. Generate contents locally only with `git show f56db73dabbaec1e92a421bbad76c239ed8d1ae2:deploy/komodo/<stack>/compose.yml`. Verify expected UTF-8 raw byte length/SHA and effective app image pins before submission. All three exact blobs are regular files in that committed tree; their parent paths are Git directories. The qualified templates use no extra on-host build/config dependencies for these maintenance operations. The app-B gateway is an immutable image, not a host-side Dockerfile build.
6. Keep the registered accelerator routes, existing credential rules and TLS unchanged. The earlier empty-account guard only establishes the Komodo credential selection path, not absence of preexisting host credential helpers/caches. Preserve the parent's separately required anonymous-routing evidence; the fallback does not authorize copying credentials or introducing a new mirror.

## Receipt and acceptance requirements

For each stack, issue at most one file write, recording a submitting event first. Validate the response/update identity, operation `WriteStackContents`, target type Stack and exact stack ID, terminal `Complete` and `success: true`; retain the exact returned update ID and verify with GetUpdate when available. The write handler is synchronous and may not return an update ID before a timeout. If the outcome is uncertain, do not blindly repeat: inspect the known target's update history and actual host file contents/sha first, then resolve the outcome explicitly.

A successful WriteStackContents update alone is insufficient. RefreshStackCache can return without an HTTP error while storing remote file errors, and can retain stale contents when host lookup fails. Explicitly refresh, require the correct healthy host before/after, empty remote_errors/missing_files, exactly one `compose.yml`, unchanged expected config and exact actual raw hash:

| Stack | SHA-256 |
| --- | --- |
| lingxiloop-app-a | `4ad4d738a8f41d549412a71c4de8c78e5fb3f2c5365be86d5fa892db8877b050` |
| lingxiloop-app-b | `145ded6c585329317b54c2cca24e80870ab151d870a7c749bd2724dd852c5a26` |
| lingxiloop-core-state | `dda3dd16ff30968905f2083d271a28d12e1519f713ce46a7fead19a02ce82dab` |

Then perform the already-reviewed repeated online host-mode metadata checks on both application hosts and read-only source SQL on core-state. Keep exact cached target image digest/ImageId checks and unchanged original-container health before/after. Only those actual terminal successes plus host hashes qualify the replacement for another maintenance attempt. No Git warm/reclone loop is necessary or useful in this fallback.

Retain the fresh format2 plan, new drained backup, zero-writer barriers, migration provenance checks, fix-forward boundary and staged health gates for subsequent release. Do not treat this source research or file-write receipt as target production acceptance.

## Source evidence hashes

- Komodo v2.3.3 Cargo.lock: `21a73b1b313b0f783750f6b8424fc99c532891de63a071d4fc642cc61e1e405d`.
- mogh_secret_file 1.0.1 crate: `713d8731c78a3b867d712e394cef4be52b278e45aeca4b80ceb41b08d1c32334`.
- Extracted write.rs: `552985db81907c9c39aa26f82aac8f849d28ba95046957acb9e430d1ff50dcce`.
- Cached Core write/stack.rs: `237d3d8dc414cbc3f103d38ab58fa75db8a9a36e4dd1c084986d8150aed43aa7`.
- Cached Periphery api/compose.rs: `883bb3387a2a320f02831f61b6325817faa1f935f6cff3ecbf1f4c43161ea8ee`.

No production action was denied, pending or uncertain in this review because none was submitted. The parent-reported existing clone remains outside this review's execution scope.
