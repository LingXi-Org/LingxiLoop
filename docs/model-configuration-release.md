# Explicit model configuration release

Failure model recorded before implementation, 2026-10-22.

This is separate from the product54 image publisher. It changes only
`OPENAI_MODEL` and `OPENAI_EMBEDDING_MODEL` in the two application stacks,
to `deepseek-ai/DeepSeek-V4.1-Flash` and `Pro/BAAI/bge-m3`. It never changes
credentials, images, Compose files, runtime/product schemas, historical
ledger model names, rates or vectors. All secret-bearing configuration stays
in process memory and is sent only to the existing Komodo HTTPS origin.

Reject before writes: absent exact accepted source evidence, changed full54
package/migration inventory, changed image identity/layers, duplicate/missing
model environment entries, unsupported/multiline dotenv syntax (including
Compose colon assignments), unrelated stack or container policy drift,
replaced/restarted source containers, another rollout/action, unavailable
host, missing complete finite shadow plan/fence receipt, or an old knowledge
API/worker which is still running. The stopped knowledge service identity,
image and full stack configuration remain bound throughout this operation.
Numeric chat/embedding price overrides and non1024 BGE dimensions reject this
two-key-only release; they require a separately reviewed explicit change.

Historical plan/fence files never prove current state. Read-only preflight,
execution preflight, each configuration write, and final verification run the
reviewed shadow `status` action through the existing authenticated Komodo
oneoff. It checks the actual Surreal pointer, revision, all source fence events
and complete bounded source watermark. Before that probe, bind the staged KB
Compose bytes, full stack configuration and exact audited new probe image;
require `pull_policy: never` and native oneoff `pull: false`. The original
stopped KB container stays stopped. The probe does not migrate or activate data.

Drain Worker A/B then Web A/B, allow at most150 seconds for natural lease
expiry, and require two visible zero barriers. Do not edit lease rows. Only
then update each app's two environment values and verify the entire updated
configuration. Deploy Web A/B then Worker A/B with no dependency or image
pull. Bind readiness to the first observed new container ID and unchanged
audited image. Verify all54 migration records throughout. No migrator,
backup, source staging, knowledge backfill or index activation runs here.

Every native operation requires a matching freshly confirmed Komodo
`Complete` receipt and boolean success. A configuration update has no native
update ID in Komodo2.3.3: its evidence is the successful API response plus
exact complete configuration readback, explicitly labelled as such.

An uncertain response stops immediately without resubmission. Explicit
continuation may accept only a raw-hash-bound terminal failed receipt with
complete native action pairing and saved boundary checkpoints. It rereads
all previous terminal native updates, including `success: false`, and validates current exact source/stopped/new
container identities, stack configuration phases, knowledge stop and schema.
It skips already completed stops, configuration writes and deployments;
observed target containers are only checked for health. Missing checkpoints,
unknown native outcomes, replacement, contradictory success or completed
release inputs reject continuation. A successful mutation without its semantic
checkpoint also rejects. HTTP401/403 from any read or write is preserved and
cannot be continued. No automatic retry or rollback.

Validation must cover exact two-key patching with unrelated secret bytes
preserved, duplicate/injected model keys, arbitrary target models, all policy
and provenance drift, live leases, stopped-knowledge identity drift, terminal
native failure versus uncertainty, partial configuration/deployment, receipt
tampering/replay, first target ID replacement and a resumed observation which
must not submit a previously completed action.

## Operator inputs and commands

Use the latest successful source acceptance after the preceding image release,
not an older historical baseline. Required accepted evidence is the standard
`public-text-host-acceptance/v1`, including `readerContainers` and
`evidence.observed.stacks` / `evidence.observed.containers`. Stack entries bind
`id`, `configSha256` and `ref.sha256` (or `composeSha256`). Container entries
bind the full source policy in `policy.configurationSha256` (or
`configurationSha256`). Keep the complete all-layer source audit, its exact
formal package descriptor and the raw public OCI config.

The draft input has exactly three fields: `release` (that immutable descriptor,
including its image audit digests), `sourceModels` (the two observed effective
models) and `knowledge` (the seven fields `stack`, `server`, `id`,
`configSha256`, `containerId`, `imageId` from the actual stopped old knowledge
service, plus `probe`). No credentials or complete environment is part of an input file.

`probe` has `composeSha256`, `scopePath`, `bindingsPath`, and `image`.
The two private, authoritative migration inputs must already exist on the
knowledge service's data mount at `/app/data/rag-shadow/<migration-id>/scope.json`
and `bindings.json`; the oneoff reads them without printing corpus IDs or text.
`image` binds `reference` (the fixed accelerator, KB image and full Git SHA),
`indexDigest`, `configDigest`, `manifestDigest`, all ordered `diffIds`, and raw
`auditSha256`. The required separate KB audit is
`cloud-knowledge-oci-full-audit/v1`, including source COPY comparisons (especially
`rag/shadow.py`), every expanded OCI layer, locked Python runtime inventory,
Dockerfile and uv lock hashes. A caller-supplied image expectation alone is
insufficient. Stage and audit that probe source before preparing this plan.

The knowledge evidence is the shadow CLI's completed `plan` envelope with
`result.format=rag-shadow-plan/v1`, and completed `fence` envelope with
`result.format=rag-shadow-fence/v1`. Their database identities, migration,
source hash/revision and all counts must agree. The finite scope/budget stays
bound by both raw file hashes. `reserved_cost_cny` remains a finite nonnegative
decimal string, matching the shadow operator's exact Decimal representation.
This is a stop/fence gate; it does not claim
the shadow database has already been backfilled or activated.

Run through the existing Sigillo-injected Komodo path:

```text
node scripts/host-release-model-config-cli.mjs --preflight
  --input /absolute/draft.json --output /absolute/new-plan.json
  --acceptance /absolute/current-acceptance.json --audit /absolute/source-audit.json
  --image-config /absolute/source-config.json
  --knowledge-plan /absolute/knowledge-plan.json --knowledge-fence /absolute/knowledge-fence.json
  --knowledge-image-audit /absolute/knowledge-full-image-audit.json
```

This is read-only collection and creates a sealed plan plus
`<output>.preflight.json` with actual observations/native read receipts.
Repeat with that sealed plan as `--input`, a fresh `--output` and no mode flag
for offline verification. Add `--execute` for the authorized two-model
configuration rollout. Every output is exclusive: existing receipts cannot
be overwritten.

For a known terminal failed attempt, use `--continue --failed
/absolute/prior-receipt.json --failed-sha256 <raw-sha256>` and the same sealed
plan/evidence with a fresh output. The old receipt stays unchanged; the new
receipt retains all earlier checkpoints and binds its predecessor hash.
Authorization refusals (401/403), unknown operations and missing checkpoints
cannot continue through this command. Diagnose and report their exact action
and target before requesting any new authority.

After success, the old KB API/worker intentionally remains stopped. Continue
the separately reviewed shadow backfill/verification/CAS process, then verify
the new knowledge API/worker's actual generation and readiness. Verify public
HTTPS and fresh four-container acceptance, and invoke supported native memory
maintenance/coverage checks separately. Never call this configuration receipt
proof that knowledge or memory reindexing is complete.
