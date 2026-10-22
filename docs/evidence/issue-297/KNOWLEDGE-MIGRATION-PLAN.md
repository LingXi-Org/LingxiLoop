# Pro BGE knowledge migration assessment

Status: repository-only design, not an implemented or executed migration. The production model/index inventory is unknown because the existing production MCP entry is denied (403 / Cloudflare 1010). No retry, alternate production route, corpus enumeration or real-data copy was performed. The two private visualization-case investigation permissions do not authorize a general corpus inspection.

PR #299 prepares defaults and prices. It does **not** complete the switch of an existing knowledge index to Pro BGE. Runtime 3.8.1 adoption is a separate formal dependency/release step owned by the integrator; these observations were checked against the installed, locked 3.8.0 public package. Recheck its public memory/index behavior against the formally published replacement before deployment.

## Why a direct environment change cannot be the migration

| Owning path | Current behavior | Consequence |
| --- | --- | --- |
| `third_party/open-notebook/open_notebook/rag/runtime.py:67` and `:170` | One `open_notebook:rag_embedding_contract` per Surreal database, checking model, normalized base URL, model ID and dimensions | Changing the old contract's name or disabling the checks would relabel an index without proving compatibility. Leave the old contract intact. |
| `third_party/open-notebook/open_notebook/rag/schema.surrealql:29` | `source_embedding` has source/order/content/vector, with no model or generation column | Old and new vectors must not be mixed in this table within one database. The vector query's same-length check proves only dimensional equality. |
| `third_party/open-notebook/open_notebook/rag/ingestion.py:63` | `replace_source_embeddings` deletes a source's existing vectors and recreates them in one transaction | Calling it on the live old database destroys the old vector set. It is suitable only inside an isolated new generation during this migration. |
| `third_party/open-notebook/api/rag_router.py:828` | Search intersects requested source IDs with notebook references and company ownership before querying chunks | A shadow generation must preserve these relationships and perform the same authorization checks. It must never introduce cross-generation or cross-tenant fallback. |
| `server/src/modules/knowledge/provider.ts:153` | One provider URL is selected for the process | A controlled generation resolver or coordinated process cutover is needed; the current code is not already a dual-index router. |
| `server/src/modules/knowledge/embedding-proxy.ts:25` | The authenticated proxy permits only the configured global embedding model | A running old query service and a Pro backfill cannot safely coexist by changing this one variable. A bounded migration/generation route is needed before shadow backfill. |
| `third_party/open-notebook/open_notebook/database/repository.py:57` and the knowledge Compose service | Namespace/database are already configurable with `SURREAL_NAMESPACE` / `SURREAL_DATABASE` | A separate database and shadow RAG instance can use the current schema without changing the old database or interpreting old vectors as Pro vectors. |

There is no current HNSW/MTREE vector index to rename in this RAG profile: the schema's vector function performs a scoped cosine scan. “New index” below means a new independently identified embedding database/generation and its search structures, not renaming a physical index.

## Recommended architecture: shadow database and retained old reader

Create a fresh, specifically named Surreal database/generation plus a shadow RAG API/worker on the existing private network. Keep the old reader, old database, old model contract and immutable image identity available throughout preparation. If the existing service account cannot create a database, stop provisioning and have the environment owner provide a correctly scoped existing resource; do not mint new credentials or expand access here.

The shadow has a new contract for `Pro/BAAI/bge-m3`, 1,024 returned dimensions, and its exact authenticated embedding proxy URL. Contract identity and API endpoint are pinned before any vector is written; readiness alone is not evidence that source backfill is complete. The new and old database/generation identifiers remain part of operator receipts even when their logical `source:` or `notebook:` record IDs are preserved. Historical vectors retain their original fully qualified database/record/model identity.

Preserve logical notebook/source IDs, external keys, company IDs, notebook-reference edges, source ingestion fingerprints and extracted text/chunk/page-marker content. Recompute Pro vectors in the shadow; never copy old vectors as Pro or modify the old records. A migration manifest must bind each old generation/source/chunk ID and content hash to a new generation/source/chunk identity and the newly measured Pro request/price receipt. Historical citation text and captured evidence remain unchanged. If any source identity or chunk identity must differ, explicit generation-aware mapping is required before cutover; do not silently overwrite PostgreSQL external-source bindings or replay old citation IDs against unrelated content.

Do not replay queued/running command records or private command payloads into a second worker. Start from a consistent snapshot of settled sources, then record the actual completed shadow work with new job receipts. Missing extracted text, failed or pending sources, deletions and source changes must appear explicitly in the manifest and catch-up queue rather than being called migrated. Reuse stored extracted text/chunks for the first generation when possible, avoiding fresh network extraction that could change the source silently.

R2 objects must remain protected from shadow cleanup: a copied source must not acquire ownership of a shared original object. Use a separately identified shadow prefix or verified read-only shared references with deletion ownership preserved. Candidate deletion, retries and rollback must never trigger `Source.delete()` against the original object, old source, old namespace or shared bucket. Ordinary product source deletion still needs its normal authoritative authorization and consistent tombstone propagation to every retained generation.

## Finite implementation preparation, before any production command

These pieces are recommended for a separate migration issue/PR with deterministic tests; they are not added by this assessment:

1. A typed, validated generation manifest containing only configured resource identities and aggregate/hash receipts in public evidence. Manifest states: planned, backfilling, caught-up, verified, active, retained. Include old/new model contract hashes, schema/image digests, stable source version/chunk hashes and a writer watermark. Keep raw corpus text and credentials inside the authorized service boundary.
2. A planner/dry-run that reads only the approved corpus inventory and reports missing bindings, outstanding jobs, storage needs and estimated token/cost bounds. Default to read-only; refuse unknown target identity, same source/target database, pre-existing nonempty target without a matching manifest, incompatible dimensions or unapproved corpus scope.
3. An idempotent resumable shadow backfiller with bounded batches and per-source transactions. Every result must match the planned content/fingerprint and returned model/dimensions before commit. A source edit invalidates the pending result; a tombstone cancels it. Never mutate the old embedding contract or call live old-database replacement helpers.
4. A generation-aware internal embedding route. Resolve exact model, company and workload from server-owned migration/generation configuration; preserve existing service authentication and bounded input validation. The ordinary public proxy remains strict. Do not turn it into an arbitrary-model proxy or let a request parameter choose another tenant/index.
5. A provider/generation resolver shared by Web and Worker, with a compare-and-swap active-generation revision and a fenced migration writer. Retain the old private read path but route each request wholly through one authorized generation; do not merge unrelated vectors or fall back to another conversation/company on a miss.
6. A verified catch-up/cutover command that requires the complete manifest, matching current watermark and two generation health/contract receipts before changing the active pointer. Drain old ingestion claims or pause only knowledge mutations for the final bounded catch-up; do not stop unrelated chat or change product/native schemas opportunistically.

## Required production inventory and consistency evidence

The following are gates to collect through restored, legitimate access, not facts established in this cloud task:

- Exact old reader/API/worker image digests and source commit; Surreal host/namespace/database; RAG schema version; stored contract's model/model ID/base/dimensions; current provider URL, proxy route and authentication mechanism. Never publish secrets or full environment responses.
- Exact PostgreSQL knowledge notebook/source bindings in the approved scope, with company/project/conversation access boundaries, source external IDs, status/deleted state, ingestion fingerprint/version and command/writer watermarks. Summarize counts/hash manifests publicly, not source text.
- Old source/notebook/reference and chunk counts, stable content/order/page-marker hashes, storage ownership/prefixes, missing or nonterminal sources, pending leases, retained backups and tested restore identity. A count alone is insufficient.
- New database/generation is distinct; its contract is exact Pro BGE/1,024; every eligible source/chunk has matching content and version plus a newly generated Pro vector of valid dimension/norm; all exclusions are explicit. Record real Pro model IDs, measured input tokens, CNY 0.000070/K and configured FX snapshots. No copied old vector qualifies as new-model coverage.
- No active/deleted/changed source differs between current authoritative bindings and the final migration manifest at the cutover watermark. Prove authorization intersections, cross-company rejection, expected retrieval quality on a bounded approved/synthetic corpus, stable citations and consistent source detail reads. Readiness probes and a few successful searches cannot substitute for full manifest reconciliation.
- The CAS/fence operation and resulting effective Web/Worker/provider/generation configuration have terminal receipts; actual production health and result paths agree after switching. None is currently available while production access is refused.

## Reversibility and permission boundary

| Action | Reversibility / authority |
| --- | --- |
| Prepare planner, schema/route changes and tests locally | Reversible repository work; no production state involved. |
| Create an empty shadow database/service using already authorized resources | Additive and reversible if target identity, quota and ownership are verified; requires real allowed infrastructure access. No credential creation or permission expansion is implied. |
| Read approved source inventory and generate paid Pro backfill into the shadow | Leaves old data intact but consumes money and processes the corpus. Requires a finite approved scope/cost bound and legitimate production access; the two private case permissions are insufficient. Retain resumable receipts. |
| Switch the active generation after a bounded write pause | A fenced routing/configuration change; require all inventory/consistency gates. Resume mutation ingress only after validating the chosen generation. |
| Switch back before any new source mutation or with a proved identical current watermark | Reversible pointer/read-route recovery with both contracts intact; verify every effective service and health receipt. Preserve new generation for diagnosis. |
| Switch back after new writes, deletes or ACL changes | Old generation may be stale. Do not blindly switch or restore old source data. Fix forward; otherwise first prove authorized catch-up/tombstone and access consistency under a separately reviewed recovery plan. No automatic dual-write of new calls to the old embedding model is proposed. |
| Drop/reset old namespace, overwrite the old contract, delete vectors/backups/R2 artifacts, or rebuild in place | Destructive; outside this assessment and requires exact explicit authority. Not required for the shadow migration. Retain the old generation until a separately authorized retention/cleanup decision. |

Native runtime/database reader rollback is separate: never start an old incompatible runtime reader against the installed product/native schema merely to revert the embedding route.

## Native memory is a separate, already versioned path

The published package's `EmbeddingDriver.cacheKey` includes endpoint, requested model ID, dimensions/expected dimensions and optional index version. `memory/semantic` queries and writes match tenant, scope, memory version, `model_key` and the provider's actual returned model. Switching to Pro therefore creates a distinct model key rather than renaming existing vectors. Recall enqueues bounded background work for eligible current records and keeps honest keyword/pending retrieval while the new key is incomplete. Refresh checks lease/fence, memory version, epoch and current authorization before writing.

Use these public runtime behaviors and preserve old rows. Do not issue private runtime-table DDL, bulk rename model keys or reset scopes. Require a synthetic old/new-model-key separation and stale-version/deletion regression, and inspect supported readiness/coverage for the new key through its authorized public API when access resumes. The knowledge shadow migration does not prove native memory backfill complete, and native memory's model-key isolation does not make the unversioned Open Notebook table safe to repoint.

## Local validation and outstanding work

This assessment used source inspection only. Existing synthetic tests already exercise changed endpoint/dimension rejection (`third_party/open-notebook/tests/test_rag_contract.py`), and #299's template/memory-price regressions remain applicable. The outdated production RAG template assertion is updated to require the exact `:-Pro/BAAI/bge-m3` fallback while retaining its explicit credential, proxy-origin, no-env-file and RAG-only process checks. The owning `scripts/production-rag-contract.test.mjs` is run in full for that correction.

Migration implementation, synthetic shadow/catch-up/CAS/recovery tests, real resource inventory, approved corpus scope, paid backfill, index cutover and production acceptance remain **not implemented / not executed**. No production success is claimed by the defaults PR or this plan.
