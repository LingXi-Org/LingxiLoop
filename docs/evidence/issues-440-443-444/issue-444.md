# #444: WuKongIM release and debug artifacts

Baseline: LingxiLoop `9e3bfd892fa53f22dddbc00e98f466c21ce01b7d`.
Owner: isolated branch `codex/issue-444-wukong-artifacts`; root integrates.
Scope: `server/docker/wukongim.Dockerfile`, focused validation and this evidence.
No production operations, independent audit, CI dispatch, issue closure or push.

## Consumers, decision and failure model

The CI matrix (`scripts/ci-scope.mjs`) and E2E Compose build the default final
stage with upstream `c7f663fa23a4ee2c6f7e08c68423f50f0f6e9c47`.
The source stage also applies only `pkg/controller/raft/raftstore` from
`0194a738d04836899b998de8b4ac392b3aadb979`. Preserve both identities, the
raftstore check, CGO setting, Alpine/CA, runtime config and Compose's BusyBox
`wget` readiness consumer. No runtime, data, protocol or authorization change.

Failure modes: stripping removes DWARF/symbol tables required by source-level
debuggers; an unrelated debug binary would be misleading. Keep a named `debug`
target from the same builder, with both build identities and binary hashes in
the shared build manifest. Keep Go runtime symbolization (`.gopclntab`) and
exercise SIGQUIT stack output after the IM probe. Rollback is the prior
Dockerfile; no durable-state conversion is involved.

## Environment and checks

Linux/amd64; Docker Engine 28.4.0 with default seccomp and sandbox unchanged.
The upstream module asks for toolchain Go 1.25.11, so the 1.25.0 builder image
normally selects that actual toolchain. Use the same actual version for both
binaries; do not attribute historical image or toolchain changes to stripping.

The environment requires an outbound proxy and its CA. Original Dockerfile
build attempts failed first without proxy routing, then at proxy DNS/TLS.
Validation uses only a temporary Dockerfile with BuildKit secret mount
`environment-ca` and exported `SSL_CERT_FILE` / `GIT_SSL_CAINFO`, proxy host
resolution and standard proxy build args. CA trust verification stays enabled;
the secret is not copied into the image and these environment accommodations
are not repository changes. A local exact upstream checkout/cache was also
copied to `/tmp/issue444` and the fixed raftstore directory overlaid there.

Observed: `go test -count=1 ./pkg/controller/raft/raftstore` passed with Go
1.25.11. Initial offline reuse failed on missing `testify` 1.11.1; normal
checksum-verified downloads supplied it. A preliminary forced Go 1.25.0 test
also passed, but its build was stopped as a superseded, unequal baseline.

Measurements and runtime probes: **pending**. Raw work logs currently under
`/tmp/issue444`; final portable results will be linked here before handoff.

## Reproduce runtime verification

Run an isolated single-node cluster from each target with a fresh disposable
data directory, loopback-bound API and `WK_CLUSTER_NODES` pointing to its own
container hostname. Wait for `/readyz`, then run:

```sh
node docs/evidence/issues-440-443-444/issue-444/smoke.mjs http://127.0.0.1:55044
```

This checks channel creation, a real `/message/send` acceptance receipt with
positive sequence, and persisted history payload/sequence roundtrip. It does
not substitute for full LingxiLoop application tests, websocket client delivery,
multi-node load, real-provider testing or production acceptance.
