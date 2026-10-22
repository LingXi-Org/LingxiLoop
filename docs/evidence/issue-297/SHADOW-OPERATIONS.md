# Fenced Pro BGE shadow generation

This implements an additive RAG database generation, not an in-place vector
replacement. It performs no product/native migration, old-vector rewrite,
credential provisioning, remote extraction, command replay or database/object
deletion. Production execution belongs to the sole release coordinator.

## Resource and scope inputs

Use a formally built, immutable RAG image containing
`open_notebook.rag.shadow` and the matching server image. The RAG image's
entrypoint resolves the generation pointer before starting Supervisor, so its
API and worker inherit one database/model/endpoint/revision. An unmanaged
database continues using its existing configuration. Explicit operator actions
install the source/target fences; image startup does not install them.

The private `scope.json` must identify the actual existing namespace/source
database and a distinct empty target database. It contains:

- `migration_id`, `namespace`, `source_database`, `target_database`;
- exact `company_ids`, `source_ids`, `notebook_ids` (including empty notebooks);
- `authoritative_bindings`: one `{source_id,company_id,notebook_ids}` for every
  source, reconciled against current PostgreSQL product bindings;
- `binding_manifest_sha256`: raw SHA-256 of the private canonical binding file;
- finite `max_sources`, `max_notebooks`, `max_references`, `max_chunks`,
  `max_manifest_bytes`, `max_input_tokens`, `max_cost_cny`;
- `product_lock_relations`: the reviewed PG relation profile; the default is
  the six core knowledge/case/project tables listed below. Plan seals its
  sorted names as `lock_scope_sha256`;
- `target_base_url`: the configured existing origin followed by
  `/internal/open-notebook/v1/shadow`.

The canonical binding file has `format: rag-shadow-bindings/v1`, `namespace`,
`source_database`, exact `notebook_ids`, and `sources` equal to
`authoritative_bindings`. Extra semantic product-binding metadata may be
included and is covered by its raw hash. Do not include timestamps in the
canonical semantic payload; native observation times belong in separate
receipts. Never publish this private file, IDs, source text or command payloads.

The operator must obtain this file through the authorized finite corpus
inventory. The CLI verifies bytes, scope equality and RAG source/company/edge
closure; a supplied file does not prove it is a fresh PostgreSQL observation.
The independent PG lock coordinator must prove freshness before final cutover.
Unbound/orphan notebooks, sources or edges are a blocker, not an invitation to
expand the allowlist silently.

This first implementation deliberately caps the resident corpus at 512 chunks,
1,000 sources/notebooks, 4,096 references and 32 MB of conservative text/metadata
length. Count/dimension/length checks precede loading vectors/text. Larger
corpora require a separately reviewed paginated implementation. Parent's
read-only production observation on 2026-10-22 reported 4 sources, 5 notebooks,
4 references and 35 chunks; the implementation does not hardcode those counts
or treat that observation as an executed migration.

## Preparation and backfill

Invoke the CLI inside the existing authorized RAG service environment, using
its existing Surreal and embedding service credentials. Never copy credentials
into command arguments or receipt files. All output paths are exclusive,
mode 0600; each subsequent command uses a new receipt path.

```sh
python -m open_notebook.rag.shadow plan --scope /private/scope.json \
  --bindings /private/bindings.json --output /private/plan.json
python -m open_notebook.rag.shadow fence --execute --scope /private/scope.json \
  --bindings /private/bindings.json --plan /private/plan.json \
  --output /private/fence.json
python -m open_notebook.rag.shadow status --scope /private/scope.json \
  --bindings /private/bindings.json --plan /private/plan.json \
  --output /private/current-fence.json
python -m open_notebook.rag.shadow backfill --execute --scope /private/scope.json \
  --bindings /private/bindings.json --plan /private/plan.json \
  --output /private/backfill.json
python -m open_notebook.rag.shadow verify --scope /private/scope.json \
  --bindings /private/bindings.json --plan /private/plan.json \
  --output /private/verification.json
```

First stop/drain the old knowledge writer through the authorized Komodo path.
The database fence then rejects late writes to source/notebook/reference/
embedding/command tables and the old schema/embedding-contract records. Source
snapshot drift after fencing leaves an explicit closed state and stops.
Existing event definitions must match exactly; unknown event drift is refused.
Do not alter lease tables or cancel unrelated chat to manufacture a barrier.

The fixed Pro-only proxy route is enabled when the server's effective embedding
model is already Pro, or through an explicitly published
`OPEN_NOTEBOOK_SHADOW_EMBEDDING_ENABLED=true` setting. The ordinary proxy retains
its global-model restriction. Do not mix this configuration change silently
into an image-only release. For the no-extra-flag route, keep the old KB closed,
publish the separate global Pro configuration, then backfill. Source/target
contracts remain distinct and the target keeps its immutable shadow proxy URL.
Normal active-generation RAG requests need no operator reservation header when
global Pro is effective; backfill always sends its reserved request hash.

Every source uses its existing text/chunks and original citation IDs. Terminal
command status/result fields are copied without arguments/context; pending or
unknown commands block the operation. Created timestamps are preserved.
Source/notebook `updated` is a schema-controlled value; original source/version
bytes remain sealed in the migration receipt. Copied shared R2 asset references
are `owned:false`; no original R2 artifact or retained record is deleted.

Before each paid request, a durable target receipt reserves a conservative
UTF-8 byte token bound plus per-input overhead. The Pro route issues one
provider attempt and retains the authoritative measured-usage ledger with the
same hashed request identity. CNY 0.000070/K is retained as the tariff estimate;
actual measured input tokens remain separate. Old ledger models/rates do not
change. A lost/invalid response leaves an unresolved reservation and blocks
replay. A completed response survives an unsubmitted/rolled-back source commit
and is reused without paying again. Inspect unknown outcomes through the real
request ledger; do not delete reservations or resubmit to make progress.

## Short PostgreSQL barrier and two-phase cutover

Verification reconciles every authorized source, notebook, reference, terminal
command and chunk, exact contract/dimensions, old frozen watermark, new vector
hashes and request budgets. The target is then sealed against every data write,
including migration writes. `activate` changes the shared pointer only to
`phase: activating`; API/worker startup still refuses to open the new database.

```sh
python -m open_notebook.rag.shadow activate --execute --scope /private/scope.json \
  --bindings /private/bindings.json --plan /private/plan.json \
  --verification /private/verification.json --output /private/activating.json
```

RAG fencing does not freeze PostgreSQL. Creates/enqueues, tombstones, case
publication and notebook bindings can commit before provider work succeeds.
The production coordinator must now acquire a bounded real PG transaction
using the existing app `db-migrate` environment, never a copied PG credential.
Acquire the existing project/case provisioning advisory locks first, then
short-timeout/NOWAIT `SHARE` locks for the actual semantic binding tables.
At minimum review `knowledge_source_jobs`, `knowledge_sources`,
`knowledge_notebook_bindings`, `organization_case_notebooks`,
`organization_cases` and `projects`. Include conversation scope/exclusions only
when they are part of the sealed semantic payload. Do not include unrelated
touch timestamps. Dynamic PG authorization remains authoritative and is never
copied back from RAG.

The same live PG session must recalculate the canonical binding payload and
match its original hash, then hold its locks until final CAS/reader readiness.
Use a fixed maximum 90-second transaction, bounded heartbeat and automatic
ROLLBACK; a lock refusal releases the entire transaction. Do not hold these
locks throughout provider backfill. SHARE permits normal reads but briefly
blocks knowledge writes/attachment intake; locking `projects` also delays
editing paths whose triggers touch the project. Ordinary chat is not a reason
to lock message or LLM-ledger tables.

The coordinator verifies the native operation/container/image/command identity
and fresh held-lock heartbeats, then provides this private gate envelope:

```json
{"complete":true,"action":"product-lock","result":{
  "format":"rag-shadow-product-lock/v1",
  "plan_sha256":"<plan seal>","verification_sha256":"<verification seal>",
  "binding_manifest_sha256":"<fresh canonical PG binding bytes hash>",
  "observed_at":"<UTC heartbeat>","deadline_at":"<UTC bounded rollback time>",
  "pg_backend_pid":123,"pg_backend_start":"<UTC>","pg_transaction_start":"<UTC>",
  "held_lock_count":7,"lock_mode":"ShareLock","lock_scope_sha256":"<plan lock scope hash>",
  "komodo_update_id":"<24 hex>","container_id":"<64 hex>",
  "image_id":"sha256:<64 hex>","command_sha256":"<64 hex>"
}}
```

This is a completed *observation* of a still-held native lock operation, not
a claim that the long-lived operation has completed. A hand-written JSON file
does not prove a live PG lock. The cloud coordinator, which owns Komodo access,
must verify the actual operation and keep observing it; the RAG container does
not acquire Komodo credentials or infer remote liveness from a Boolean.

```sh
python -m open_notebook.rag.shadow finish --execute --scope /private/scope.json \
  --bindings /private/bindings.json --plan /private/plan.json \
  --verification /private/verification.json --product-gate /private/live-pg-gate.json \
  --output /private/active.json
```

`finish` rechecks sealed data, matching binding identity and native observation
fields, requires a heartbeat at most ten seconds old and at least ten seconds
remaining before rollback, then CASes `activating` to `active` and binds the raw
gate hash into the pointer. Expired/missing evidence leaves the KB closed.
Only then restart the authorized RAG service. The wrapper verifies the actual
control pointer/target seal and opens the target; `/readyz.active_generation`
reports database, revision, model, endpoint, plan/verification/product-gate
hashes after checking that the current process matches them. Verify the actual
new container/image, API and worker plus real retrieval/authorization before
releasing the PG barrier and accepting the release. The separate production
coordinator and its native PG-lock helper require their own final validation.

## Failure and retained data

Never replay an unknown native or paid operation. Inspect its existing receipt,
pointer, source/target phase and request ledger first. `abort --execute` with
the original scope/plan explicitly returns a still-closed fenced/activating
pointer to its original source and retains the target. It cannot undo an
already-active cutover. Confirm old model/proxy configuration compatibility
before restarting an old reader; abort is not an automatic environment rollback.

If PG drift, timeout or lost heartbeat occurs, keep the new reader closed,
retain both databases and diagnose. A completed active cutover with new writes
cannot be blindly switched back: current tombstones, bindings and access may
have advanced. Fix forward or review a new catch-up plan. No purge/drop/reset
or retained-R2 cleanup command is supplied.

## Verification scope

Owning tests use the exact production Surreal image digest in a separate,
loopback-only in-memory server and synthetic corpus; paid-provider responses
are synthetic. They exercise source and target fences, finite/authoritative
closure, budgets, unknown-response refusal, source-commit resumption, citation
and timestamp retention, stale PG gate refusal, two-phase CAS, startup fencing
and explicit pre-open abort. The real Express proxy test checks authentication,
company/model restrictions, ledger correlation and one upstream attempt on 503.
CI starts the database and retains JUnit so migration tests cannot pass by
silently skipping. These checks do not constitute production corpus backfill,
provider capability confirmation or a verified production PG-lock observation.
