# Native memory model-key coverage

Use this together with the separately verified model configuration release. It does not select production identities, enumerate conversations or run migration DDL. `index-status` is read-only; `index-reindex` adds bounded native index work and needs the authorized sole production executor.

## Finite authorized binding manifest

Prepare a finite internal list of existing `{companyId, principalId, runId}` bindings relevant to the approved maintenance scope. Retain its byte hash, the configured runtime/image/model and every resulting status receipt. An existing source run is required: `readRunReference` verifies its principal, and each native scope/API call resolves current product membership and permissions. A group-room identity cannot substitute for a private learner identity. Revoked or unavailable bindings are exclusions requiring an explicitly scoped decision; do not forge an identity or widen authorization to make them pass.

If binding metadata needs confirmation, use the public `readRunReference` for each exact approved company/run pair and compare its principal. The relevant product metadata is `agent_run_bindings(company_id, principal_id, agent_id, run_id, session_id)` and current participant/channel/project membership. There is no reason to search message text, inspect prompts, enumerate all conversations or reuse private-case investigation permissions. This CLI deliberately has no `all runs` or automatic identity-discovery mode.

If the operator does not yet have the finite list, the smallest proposed metadata-only inventory is the following read-only query, restricted to an explicit approved company allowlist and a positive bound of at most2000. Run it only through an already authorized database read path; this document does not execute it or extend a private-case investigation. Receiving the extra row means the inventory is incomplete and no global coverage claim is possible. It returns only existing identity tuples, with one newest source per session/agent/principal; public API authorization remains authoritative and may exclude any row. It neither reads nor searches messages, prompts, memory bodies or conversation titles.

```sql
SELECT DISTINCT ON (company_id, session_id, agent_id, principal_id)
  company_id, principal_id, agent_id, run_id, session_id
FROM agent_run_bindings
WHERE company_id = ANY($1::text[]) AND NOT internal
ORDER BY company_id, session_id, agent_id, principal_id, created_at DESC, run_id DESC
LIMIT ($2::int + 1);
```

Keep returned IDs in an internal ephemeral manifest, never in a public PR receipt. Its manifest must name the maintenance purpose, approved company allowlist, maximum binding/scope counts, exact deployed commit/image/config receipt, observation time and the existing identity triples. Hash the exact manifest bytes and retain only that hash plus aggregate receipts externally. Resolve every triple with `readRunReference`, obtain fresh `index-status`, and record rejected/revoked rows as exclusions rather than replacing identities. Dedupe returned authorized scope hashes, retain a coverage denominator and explicitly mark the finite closure incomplete when any identity/scope is missing. This proposed inventory does not by itself prove that all historical orphaned or currently unauthorized scopes are covered.

For each existing binding, using the normal authenticated production command path:

```text
npm run memory:maintain -- <companyId> <principalId> <runId> index-status
```

The aggregate receipt includes the configured model, the native public current index key, a hashed binding, hashed authorized scopes, eligible/currently indexed counts and a plan hash. It discards the other private `doctor` diagnostics. The native API owns the key; the product does not import a private driver or reproduce its key formula.

Build the manifest's authorized scope closure by deduplicating `scopeSha256` across its receipts. Do not sum duplicated scopes or infer whole-production coverage from one run. Compare the finite approved scope set and current model/key with the intended scope before enqueue. Any unaccounted scope or missing authorized binding keeps whole-scope coverage unproven.

## One reviewed enqueue pass

```text
npm run memory:maintain -- <companyId> <principalId> <runId> index-reindex <planHash> <maxEligible>
```

`planHash` must come from the saved status. `maxEligible` is an explicit positive integer at most50000. Changed scope membership, key, configured model or eligible count invalidates that plan. Indexed counts may increase while normal background work proceeds. At most16 scopes and one public `reindex` call per scope are permitted; each native call initially admits at most32 missing records. Existing native completion schedules the remaining pages under current authorization, memory version/epoch, lease, fence and root model budgets.

Submission and acknowledgement are separate aggregate receipts. An error emits `uncertain` for that scope and stops without retrying or enqueueing remaining scopes. Retain the failed receipt and resolve its actual native work before another operation. Do not change source identities, reset leases, delete jobs or invent nonces to get around a native refusal. A successful enqueue reports `coverageComplete:false`; it does not wait for or claim completed embedding work.

After Workers finish, obtain fresh `index-status` observations within a finite operator polling budget and retain those receipts. For each deduplicated approved scope, `complete:true` means its observed eligible current versions have vectors under the currently configured key. Zero authorized scopes and missing configuration remain incomplete. This is current scoped coverage rather than an atomic database snapshot; subsequent legitimate writes can create new pending versions.

The public count does not expose every row's actual returned Provider model. Bind the configuration/probe receipts and the existing shared usage ledger's aggregate actual-model results for the corresponding maintenance window/jobs. A current requested-model key alone cannot establish that an anomalous Provider alias was Pro. Keep historical ordinary-BGE model names and rate snapshots unchanged. Never copy old vectors into a Pro key or rewrite billing rows to fill evidence gaps.

## Synthetic validation

The subprocess CLI tests use synthetic public API responses and verify redaction, counts/configuration/scope rejection, reviewed bounds, stop-on-uncertainty and resource cleanup. The separate native integration uses only public `@lyyzka/lingxios` and `@lyyzka/lingxios/worker` exports, an in-memory PGlite database and a loopback synthetic 1024-dimension Provider. It creates a new disposable schema from the formal package resource; it has no production endpoint or real key.

To repeat the public API integration, provide a fixture installation containing exact `@electric-sql/pglite@0.5.8` (the matching LingxiOS development tree already has it):

```bash
NATIVE_INDEX_FIXTURE_ROOT=/path/to/fixture-installation \
NATIVE_INDEX_PUBLIC_RESULT=/tmp/new-native-index-receipt.json \
node scripts/verify-native-index-public.mjs
```

The output file is exclusive. The fixture package is a test prerequisite, not a new product dependency. This synthetic result does not establish production coverage or authorize any production mutation. The sole production executor still needs the exact deployed release and the finite real binding/scope/actual-model receipts above.
