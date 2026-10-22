# Product54 image-only release failure model

Recorded before implementation. This is an explicit reusable formal3.8.2/native14/full54 profile, parameterized by accepted source and qualified target, never by one candidate SHA. Old same-schema and migration profiles remain unchanged.

Reject before writes: changed formal package/tarball/integrity, native hash/protocol, any product migration byte, publicText2/runTrace1/purpose-json-v1 reader contract, deployment leaf, source containers, baked image settings, full stack configuration, Compose fields other than image pin/pull policy, absent exact-target CI or complete audited images.

Normal execution stops four writers, waits at most150 seconds for natural lease expiry with exact identity/provenance on every observation, then requires two zero barriers. It performs no backup, DDL, migrator or seed write. Web A/B precede Worker A/B. Any uncertain operation stops without resubmission.

Before deployment, provide an explicit source restoration command for a terminal failed image-only receipt. It must revalidate original acceptance/audits/plan/receipt bytes, all saved native operation identities and terminal states, full actual configuration and source/target image identity. Only original source containers or target containers attributable to this release may be stopped. A missing, replaced, unknown or externally restarted source blocks restoration; an unresolved operation must be resolved before any write. Re-stop only running writers, require bounded expiry plus two zero barriers, restore exact accepted source host files/config, prove source metadata, deploy source Web A/B then Worker A/B. Never invoke DB migration; refuse a recovery receipt or completed release as input. No automatic rollback or retry.

Tests must cover normal image-only release, package/inventory/config/identity drift, live/invalid leases, unknown operation outcome, all-stopped failure, partial target rollout failure, terminal native failures, wrong native update target/operation, missing checkpoint/unknown mutation, altered policy and receipt replay. Retain secret-free events and exclusive output files.

## Commands and evidence

Use the existing host-release descriptor fields and CLI. Set format to
`product54-image-host-release/v1`; both descriptors must contain identical
formal package and all54 migration records. Source acceptance is the completed
previous release's `public-text-host-acceptance/v1`, including the actual four
container IDs and three stack IDs/full configuration hashes in
`evidence.observed.stacks`. Keep both audited image configs, source/target
audits, source acceptance bytes and committed Compose source/preparation/target
hashes. The source app policy must already have pull disabled and
`--no-deps --pull never`. No source/target SHA is hardcoded in the executor.

Run `node scripts/host-release.mjs --input <absolute descriptor> --output
<new absolute plan> --acceptance <absolute source acceptance> --source-audit
<absolute audit> --target-audit <absolute audit>` offline. The online
`--prepare-images` and `--execute` modes use that sealed plan and separate
exclusive output receipts. Use the existing authorized Sigillo/Komodo path.
Before stopping production, keep the following reviewed recovery command and
all its evidence locally available.

For a known terminal failed **release** receipt, run
`node scripts/host-release-image-recovery.mjs --input <absolute sealed plan>
--acceptance <absolute source acceptance> --source-audit <absolute audit>
--target-audit <absolute audit> --failed <absolute failed receipt>
--failed-sha256 <exact raw receipt hash> --output <new absolute restoration receipt>`.
This defaults to offline verification. Add `--execute` only for an authorized
source restoration after confirming the prior process has ended. It rereads
every saved native update and the full live boundary before stopping anything.
Retain the original failure unchanged. The restoration output is deliberately
not an accepted failure input and cannot be replayed; a fresh source acceptance
is necessary before another release after successful restoration.

An operation lacking a terminal update, changed source identity or policy,
missing container, or unexpected host/config bytes blocks automatic execution
of this recovery path. Resolve the exact remote state through read-only tools;
do not resubmit the original release, rerun a migrator or invent successful
checkpoints. Image preparation occurs while original services remain healthy;
its own receipt is not an input to source restoration.
