# Native14/product50 offline planner

This directory contains the independent planner only. It does not execute
Komodo, access production or a registry, install packages, change Git refs,
start containers, run SQL, or alter any existing evidence.

The frozen driver is
`/workspace/LingxiLoop-native14-host-maintenance` at
`19422466f8463a3a1099c6fbfdd3b92d0228e1b5`. Its public `releaseDescriptor`,
`buildMemoryBackupPlan`, `validateMemoryBackupPlan`, `sealHostPlan` and
`validateHostPlan` remain the final contract. The installed formal 3.6.0
public package metadata/resources must still match; no bypass is provided.

The actual source is `7fe5b16e08dbe6634feb701d64e26c28475b917e`,
formal 3.5.8/native13/product49. Its 2026-10-20T18:31:51.583Z acceptance
hash is `d224c7d7828332d16199fa47330149496572063a0e2d05ea5d54ba5bb5d8aa02`.
The helper binds all six acceptance input hashes and the earlier acceptance
and production read, then replays the pinned pure verifier at the recorded
acceptance time. That is historical evidence of four healthy containers and
34 terminal receipts, not a new current-production observation. Execution
must still perform the driver's live preflight.

## Inputs and use

Copy `plan-input.template.json` to a new private input file. Supply the final
published **target commit**, completed exact-target CI receipt/URL/hash, full
target image audit/hash, Compose preparation/final commits, release branch
and `backupAttempt`. No target SHA, run ID or Compose ref is guessed or taken
from a PR head.

`backupAttempt` is a caller-selected safe label of at most 63 characters.
The planner appends a fresh 16-hex random nonce to that label and uses the
same nonce for the isolated restore database. The public backup builder
validates the exact source native13/product49 inventory. This creates a
command only; no backup, restore or rehearsal is executed. Global uniqueness
is not queried; the executor also requires exclusive backup-directory creation.

```bash
/workspace/.tools/node-v22.23.3-linux-x64/bin/node \
  /workspace/native14-production-release/planner/make-plan.mjs \
  --input /absolute/private/native14-plan-input.json \
  --output-dir /absolute/private/new-native14-plan-bundle
```

All inputs must qualify before the output directory is created. It must be
new, with an existing parent. Files are mode 0600 in a mode 0700 directory.
The outputs are `plan.json` and `provenance.json`; a write error is a failure,
and any incomplete output directory must not be used.

The parent can copy the exact resulting plan bytes into the release directory
and set the top-level `inputs.json` `planSha256` from the sidecar. That
top-level file belongs to the separate collector/verifier owner and is not
written by this helper.

Both Compose commits must have exactly one parent: preparation directly from
`1c2ef95cb5f1a491236b92076177035d752c681a`, final directly from preparation.
Only the two app Compose files may change, with `[skip ci] [skip deploy]`
commit messages. The frozen public Compose parser proves that the only
effective changes are the three runtime service images and pull policy.
Core and the actual accepted source branch/commit/file hashes are retained.
The parser uses local `docker compose config`, without contacting a daemon.

The local formal 3.6.0 qualification/registry receipt and actual tar are
verified using SHA256, SHA512 integrity, SHA1 and packaged schema hashes.
Both target locks and manifests are checked through `releaseDescriptor`.
The target audit must cover all linux/amd64 layers, digests/diff IDs, rootfs
inventory, and complete runtime/PDF package comparisons; its formal runtime
tar reference must equal the actual qualified 3.6.0 tar.

The CI receipt is the existing `gh run view --json ...` shape with `headSha`,
`url`, `status`, `conclusion`, and `jobs` containing `name/status/conclusion`.
Server publish, server checks, deployment contracts and integration must
succeed. Legacy deploy/manifest-update/rollout jobs must be skipped. Any
missing, duplicate, still-running or contradictory required job stops planning.

## Limited offline verification

```bash
/workspace/.tools/node-v22.23.3-linux-x64/bin/node --test \
  /workspace/native14-production-release/planner/make-plan.test.mjs
```

`tests-before-implementation.log` records the initial missing-module failure
after the tests/failure model were written, **not a reproduced production bug**.
`focused-green.log` is the initial 9-test run. `focused-final-green.log` is
the final 10-test run, including the public backup planner's nonce/attempt
binding. These checks use real local source/formal evidence, in-memory CI
and lineage mutations, and actual local Compose parsing. Synthetic CI/ref
values exist only in tests and cannot become a valid release plan.

`qualification-summary.json` records the real source replay and formal package
result without reproducing container details or command bodies. `SHA256SUMS`
binds the final delivered helpers, tests and evidence.

No complete native14 plan was generated or claimed valid: the final target
commit, publication CI, target full-layer audit and new Compose refs remain
required. The actual backup/restore, target image startup, canonical seed
read-only proof, native/product migration and final production acceptance are
outside this offline task. The seed proof belongs after image preparation and
before maintenance, so the planner does not require a future seed receipt or
invent one.
