# #444: WuKongIM release and debug artifacts

Baseline: LingxiLoop `9e3bfd892fa53f22dddbc00e98f466c21ce01b7d`.
Implementation: `0f6a575a` (integrated commit).
Scope: WuKongIM Dockerfile and focused validation. No production operations,
independent audit, CI dispatch, issue closure or push by this contributor.

## Decision, consumers and rollback

The CI matrix (`scripts/ci-scope.mjs`) and E2E Compose build the default final
stage with upstream `c7f663fa23a4ee2c6f7e08c68423f50f0f6e9c47`. The source
stage overlays only `pkg/controller/raft/raftstore` from
`0194a738d04836899b998de8b4ac392b3aadb979` (directory tree
`4b91f07f67457148519079545878866bd87660c7`). Both identities, the raftstore
check, CGO setting, Alpine/CA, runtime config and Compose's BusyBox `wget`
readiness consumer remain effective.

Observed savings support `-trimpath -ldflags="-s -w"` in the default `release`
target. A named `debug` target uses `-trimpath` without symbol stripping, from
the same builder. Each image carries the identical
`/usr/local/share/wukongim/build-info.txt`: upstream and raftstore commits,
actual Go version, platform, flags, and both binary SHA-256 hashes. The
manifest's `wukongim` hash identifies release; `wukongim.debug` identifies debug,
which is installed under the usual `/usr/local/bin/wukongim` in the debug image.
The Dockerfile's manifest shell command reproduced the exported manifest
byte-for-byte in a direct `/bin/sh` check.

The debug target retains DWARF and symbols for source-level investigation of the
same code. It remains an optimized Go build, like the previous binary; this is
not an unoptimized `-N -l` build or a detached-symbol sidecar guaranteed to match
a release core dump. Release and debug have separate build IDs and checksums.
Go runtime symbolization, normal logs and metrics stay available in release.
The existing disabled debug API setting is preserved.

Rollback: restore the prior Dockerfile. There is no durable-state, protocol,
runtime architecture, authorization, Compose, dependency or workflow change.

## Observed measurements

One paired Linux/amd64 build, actual Go 1.25.11, identical upstream plus
raftstore overlay. The upstream `go.mod` requests `toolchain go1.25.11`, so the
existing `golang:1.25.0` builder normally selects 1.25.11. The historical
preinstalled image was built without this exact patch and is not a comparator.

| Bytes | Previous flags / baseline | Release | Reduction |
| --- | ---: | ---: | ---: |
| ELF binary | 84,530,351 | 60,522,680 | 24,007,671 |
| `.debug_*` section payloads | 17,410,828 | 0 | 17,410,828 |
| Binary layer, gzip level 6 | 39,325,545 | 21,054,955 | 18,270,590 |
| All OCI compressed layers, gzip level 6 | 42,876,689 | 24,606,545 | 18,270,144 |
| Expanded layer file contents / Docker image `.Size` | 92,353,656 | 68,346,377 | 24,007,279 |
| Uncompressed layer tars, including tar metadata | 92,882,432 | 68,878,848 | 24,003,584 |

The new 392-byte shared build manifest accounts for the difference between
binary and expanded-image savings. Debug image `.Size` is 92,354,048 bytes.
Release has no `.debug_*` or `.symtab`; `.gopclntab`, `.gosymtab` and runtime
function/source-line stacks remain. [Machine measurements](issue-444/measurements.json)
include ELF section sizes, binary hashes, layer diff IDs and compressed digests.
[Build manifest](issue-444/build-info.txt),
[release metadata](issue-444/release-go-build-info.txt) and
[debug metadata](issue-444/debug-go-build-info.txt) identify the actual builds.

The measurement script reads real `docker save` layer tars and writes actual
OCI layouts with gzip level 6 / mtime 0 blobs beside the input tar. It verifies
all uncompressed hashes against the image config's `rootfs.diff_ids`.
Baseline OCI manifest:
`sha256:d6168920e9b71d566fcc46198648a350d954deba126ec1f8c7aedadfca081344`;
release OCI manifest:
`sha256:5598b9024c85f0fc0161340c64731c634c70126374b801dcfc04eeb84f47f2f7`.
These are local OCI manifests, not published registry image identities. Actual
registry compression and manifest metadata can differ; no transfer-time,
startup-time, memory, percentage target or fleet saving is claimed.

## Checks and environment limits

- **Passed:** [raftstore](issue-444/raftstore.log),
  `go test -count=1 ./pkg/controller/raft/raftstore`, Go 1.25.11. Source was a
  disposable copy at the exact upstream commit; the overlay was verified with
  `git diff --exit-code 0194a738d04836899b998de8b4ac392b3aadb979 -- pkg/controller/raft/raftstore`.
- **Passed:** baseline, release and debug each started an isolated single-node
  cluster with fresh disposable data, loopback-bound API and hostname
  `wukongim`. `/readyz` returned `{ "ready": true }`; channel creation, real
  `/message/send` reason 1, positive exact message ID/sequence, persisted history
  ID/sequence/payload roundtrip and `/metrics` `go_goroutines` checks passed.
  [Structured runtime results](issue-444/runtime.json).
- **Passed:** deliberately sending SIGQUIT after each completed IM probe emitted
  `main.main()` and `cmd/wukongim/main.go:29` in all three variants. Expected
  signal termination exit 2; sample
  [baseline](issue-444/baseline-stack-sample.txt),
  [release](issue-444/release-stack-sample.txt),
  [debug](issue-444/debug-stack-sample.txt). Full log hashes are recorded in the
  runtime JSON; raw logs remain in `/tmp/issue444` for this session.
- **Passed:** release contains CA certificates and BusyBox `wget`; the exact
  Compose command `wget -q -O /dev/null http://localhost:5001/readyz` exited 0.
  Release/debug in-container binary hashes and shared manifest matched the
  measured host binaries. Disposable containers were removed after checks.
- **Failed, environment:** original builds first failed at outbound proxy
  routing, then proxy DNS/TLS. A temporary verification Dockerfile used a
  read-only BuildKit CA secret, standard proxy args and proxy DNS mapping,
  keeping TLS verification enabled. The source fetches then succeeded, but the
  full builder ran out of shared Docker disk while compiling raftstore:
  [full attempt](issue-444/full-builder-failed.log). No security restriction or
  TLS check was disabled. Only this task's precise cache IDs were cleaned.
- **Alternative validation passed:** the exact cached source, overlay and actual
  Go 1.25.11 built both binaries on Linux/amd64 with the production flags. Their
  binaries were inserted into a temporary builder stage and the unchanged
  production Alpine 3.19 runtime suffix was built for
  [baseline](issue-444/runtime-baseline-build.log),
  [release](issue-444/runtime-release-build.log) and
  [debug](issue-444/runtime-debug-build.log). The temporary CA secret is absent
  from image layers; resulting image environment contains only `PATH`.
  This verifies the actual binaries and runtime targets, not a successful fresh
  end-to-end run of the production source/builder stages.
- **Other retained failed attempts:** offline cache reuse lacked `testify`
  1.11.1; normal checksum-verified downloads supplied it. A preliminary forced
  Go 1.25.0 raftstore run passed but its build was stopped to use the equal,
  actual 1.25.11 toolchain. The default Docker client injects environment proxy
  variables into test containers, causing BusyBox's loopback probe to reach the
  proxy and return 403. Repeating with this task's empty isolated Docker client
  configuration passed; no application or Compose change was needed.

Remaining: a successful full Dockerfile build / CI on the integrator's final
commit. Full LingxiLoop application tests were not claimed: the preinstalled
LingxiOS dependency differs from the current lock. This targeted check covers
WuKong HTTP acceptance and persisted history, not websocket delivery, full app
flows, multi-node load, provider calls, a soak or production acceptance.

## Reproduce

```sh
docker build -f server/docker/wukongim.Dockerfile \
  --build-arg WUKONG_COMMIT=c7f663fa23a4ee2c6f7e08c68423f50f0f6e9c47 \
  -t wukongim:release .
docker build -f server/docker/wukongim.Dockerfile --target debug \
  --build-arg WUKONG_COMMIT=c7f663fa23a4ee2c6f7e08c68423f50f0f6e9c47 \
  -t wukongim:debug .
```

Run each image with fresh disposable data, `--hostname wukongim`, a
loopback-bound API port and synthetic local-only join token. Wait for `/readyz`,
then run the probe (Node 22+ preserves int64 message IDs):

```sh
node docs/evidence/issues-440-443-444/issue-444/smoke.mjs http://127.0.0.1:55044
docker save wukongim:baseline -o /tmp/baseline.tar
docker save wukongim:release -o /tmp/release.tar
python docs/evidence/issues-440-443-444/issue-444/measure.py \
  /tmp/baseline.tar /tmp/release.tar /tmp/wukongim.debug /tmp/wukongim.release
```

For measurement, build the baseline runtime from the previous Dockerfile's
flags using the same upstream/patch/toolchain/platform; extract both binaries
from their images with `docker create` / `docker cp` and remove the temporary
containers. Binary and OCI archives remain under `/tmp/issue444` in this
session; portable measurements, manifests, focused logs and probes are committed.
