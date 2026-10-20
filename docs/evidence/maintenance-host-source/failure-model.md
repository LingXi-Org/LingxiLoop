# Maintenance source preparation failure model

Written before implementation, 2026-10-20. The qualified application image remains
d1075e35e16721979b484c2d9e33eeb56468ce9d; this change is operator tooling.

The failed production maintenance submitted no migration. Its post-backup
DB-free metadata action spent 18m39s preparing Git, then failed before Compose.
All original 3.5.6 services were recovered against unchanged native12/product46.
The successful backup and failed receipts remain separate historical evidence.

Komodo 2.3.3 inline Git preparation fetches, checks out the configured branch,
pulls with `--rebase --force`, then resets the configured commit. Repeated
preparation of `main` pinned ahead of its upstream reproduces a merge-history
rebase conflict. Core caches repositories by provider/repo/branch/commit; A/B
share that cache, and its five-second reuse can hide the second-pull failure.
Periphery `reclone=true` avoids the stale checkout by deleting and recloning its
owned repository on every one-off/deployment, including after writers stop.
Neither a fixed branch nor a commit pin removes Git/network from that window.

The replacement contract first prepares a fixed release branch online, resolves
any checkout residue with one scoped clean clone, and repeats warm checks beyond
the Core cache interval. Only then does it select native `files_on_host` on the
three existing stack directories. This uses the same Compose and `.env` paths;
no environment values, credentials, or application data are copied. Core's
explicit host cache refresh reads the actual host files, without Git.

Failures to cover before implementing:

- Old plan format or missing host-source descriptor must fail before service
  actions. The plan binds all three Compose hashes to its exact manifest commit.
- Wrong stack/server, unreachable host, busy stack/procedure, source mode drift,
  reclone, custom clone path, alternate Compose/environment files, hooks,
  command wrappers, auto deployment or changed project identity must fail closed.
- A cached hash is insufficient: refresh the host cache, reject errors/missing
  or duplicate files, and compare actual raw bytes. Check server health before
  and after refresh because Core can retain old cache when a server is absent.
- Never log raw files, environment values, API responses, or errors from a
  malformed remote response. Return only fixed names, hashes and timing.
- Revalidate before every one-off, stop, migration and deployment; verify both
  application nodes' DB-free metadata before draining and after backup.
- A stale/missing file or B-only mismatch must prevent the first stop. A later
  mismatch must stop progression, preserving the existing uncertain-outcome and
  native13 fix-forward boundary.
- Refresh is a narrow cache operation, not a general write API. No config writes
  are allowed by the maintenance transport. Preparation changes are separate,
  serial, fully read back, and leave existing healthy containers unchanged.
- Repository state must never be inferred from a commit config field while host
  mode is active. Successful real host one-offs and terminal receipts are also
  required online, not just cache hash checks.

This removes Git preparation from the maintenance window. It does not remove
registry, Docker startup or application failures; image digest, backup, writer
barrier and staged health gates remain mandatory. A resumed production requires
a new backup attempt and plan, never reuse of the previous drained snapshot.

Additional mirror constraint (2026-10-20 13:46 user steering): retain the existing
`accel.way2api.fun/ghcr.io/...` image path and exact audited digest. Require empty
Komodo Git/registry account selections so these operations cannot attach a
configured credential to the accelerator. Revalidate already cached image
identities online; do not claim Compose `pull:false` disables `pull_policy:always`.
