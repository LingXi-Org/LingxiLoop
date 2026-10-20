# Prepare production source before maintenance

The 2026-10-20 maintenance stopped before any migration because its DB-free
metadata operation recloned Git after writers had stopped. Original native12 /
product46 services were restored. The retained incident and backup evidence is
[separately committed](https://github.com/LingXi-Org/LingxiLoop/tree/8b8b5940f16ef1a2d3ab338b61ae363778da9166/docs/evidence/release-215-216-219/production-attempt-20261020).

This operator-only change requires plan format2 with exact host source hashes.
The previously qualified application image remains d1075e35e16721979b484c2d9e33eeb56468ce9d;
no runtime package, database migration, security setting or application image is
changed by these tools. Source preparation is separate from maintenance.

1. Select the exact manifest commit on a fixed `release/...` provenance branch
   while all existing services remain healthy. The current structural repair
   stages only its three exact public templates with native
   `WriteStackFileContents` in host mode, at the same owned paths. No production
   Git checkout is needed. The independently reviewed native writer creates
   missing parent directories; writes are non-atomic, so exact terminal receipts
   and actual host hashes are mandatory before any one-off. Validate expected
   server identity, no live bind mounts, extra source dependencies, hooks or
   command wrappers, and disabled automatic deployment. Retain the previous
   failed clone receipt; never overlap or retry an unknown source operation.
2. Keep all environment values and paths unchanged, and select native
   `files_on_host=true` on the two app stacks and core-state. Explicitly refresh
   host cache and compare actual raw Compose bytes with the exact manifest
   commit. Reject errors, missing/extra files, source drift and unavailable hosts.
3. Complete repeated real DB-free metadata checks on **both** app nodes and
   read-only source state on core-state. Retain terminal receipts and prove the
   original four healthy containers and qualified cached image IDs are unchanged.
4. Create a fresh source-backup attempt and sealed plan. `deriveHostSource()`
   derives the three hashes; `validatePlan()` binds them to `pinCommit` and the
   existing exact runtime/image/schema qualification. Do not reuse the prior
   drained backup after production has resumed writing.
5. Both hosts must already contain the exact audited image. Maintenance checks
   the existing cache and never submits an explicit `PullStack`; missing or
   drifted cache stops before drain. Required fetches belong to a separate online
   preparation step using the same approved mirror.
6. Only after independent review and successful online proof, run the existing
   maintenance CLI. It revalidates actual host files before service operations,
   checks both app nodes before drain and after backup, and preserves the original
   writer barriers, verified restore, uncertain-outcome and fix-forward rules.
7. Restore Git-based operations deliberately after target acceptance using a
   compatible source and fresh online checks. Merely changing the mode back does
   not prove an old checkout is clean.

The ordinary rollout remains blocked while maintenance pins/host mode are active.
The transport exposes only a fixed-stack cache refresh, not arbitrary writes.
Online configuration changes belong to the separately reviewed operator script;
its complete before/after configs are compared only in memory, never logged.

Existing mirror path is `accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server:<exact sha>`.
Empty Komodo Git/registry accounts are mandatory. This proves no selected Komodo
credential is attached; it does not attest to uninspected host credential caches.
No credential, daemon trust, TLS or persistent permission changes are included.
`RunStackService.pull=false` skips Komodo's explicit pull, but does not override
Compose `pull_policy: always`; registry availability remains a dependency.

## Evidence and limits

- [Failure model](failure-model.md), written before implementation.
- [Git root-cause review](git-root-cause-review.md): 34 local cases, three fresh
  reproductions of the exact CoreB rebase conflict, eight clean release-branch
  repetitions. Missing-directory failures have no proven underlying Git cause.
- [Independent online-preparation review](online-preparation-review.md), binding
  the actual [operator script](reviewed-online-preparation.mjs) by SHA-256.
- [Direct host writer contract](native-file-write-contract.md),
  [failure model](direct-host-failure-model.md), and
  [independent concrete driver review](direct-host-driver-review.md).
- [Cached-image delta review](cached-image-review.md),
  [new red case](cached-image-red.log), and [55/55 green contracts](cached-image-green.log).
- [Initial red](contracts-initial-red.log), [mirror guard red](mirror-guard-red.log),
  and [54/54 green deployment contracts](contracts-green.log).

Core can retain an old host cache when the server is unavailable; healthy-host
checks, explicit refresh, error rejection, exact hashes and actual online
one-offs narrow that limitation, but do not make mutable files atomic or immutable.
This checkpoint records implementation and local qualification. Production online
preparation is in progress; it is not a successful maintenance/deployment receipt.
