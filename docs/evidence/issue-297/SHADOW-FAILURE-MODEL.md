# Shadow generation failure model (before implementation)

The operator must supply a finite source/company allowlist and hard source,
chunk, token and CNY limits. A global database pointer may switch only after
that allowlist equals the entire old database, including notebooks, reference
edges and terminal source-command status. Unknown companies, orphan chunks or
edges, pending commands, a changed contract or any changed source byte reject
the plan. Public receipts contain counts and hashes, never corpus text or IDs.

The retained database must never receive new embeddings, renamed contracts,
source deletions, object cleanup or rewritten command payloads. A database
transaction fence rejects writes to its source/notebook/reference/embedding/
command tables while backfilling and after cutover. It is installed before the
snapshot is trusted; a change during fencing leaves a visible fence and stops.
Abort is an explicit CAS before activation and retains the target database.

The target is a different, initially empty database. A resumable target must
already carry the exact same plan identity. Copy source/notebook/reference IDs,
text, ordering, external keys and fingerprints, not old vectors. Shared asset
references are read-only (`owned:false`) in the new generation. Copy only
terminal command status/results without command arguments or context. Never
re-extract remote content or run copied jobs.

Every paid request is reserved durably before sending, bounded by UTF-8 byte
token upper estimates and CNY 0.000070/K. Provider model, usage, indices,
dimensions, finite nonzero vectors and budget must match. An interrupted or
unknown request is not replayed. Each source is committed transactionally;
retrying a completed source reuses verified stored results. Target drift or
unattributed records prevent resumption/cutover.

Verification reconciles every source, chunk, command, notebook and reference;
rechecks the old frozen watermark and old vector hash; validates the target
contract and every vector hash, and seals aggregate receipts. The first CAS
sets the shared database/model/endpoint pointer to `activating`, keeping the
reader closed. A fresh externally verified PG SHARE-lock session must match
the original canonical binding bytes through the final CAS. Stale heartbeats,
wrong relation scope, missing native container/image/command identity or fewer
than ten seconds before rollback refuse to open the reader. A JSON file or
Boolean alone is not a live PG observation. Old services fail
closed against a fenced or changed pointer. API and worker startup resolve the
same pointer before launching; knowledge service restart and actual health
acceptance remain operator steps. No rollback after new writes is provided.

The Pro-only embedding proxy requires the existing service authentication,
an explicit server-side enable flag or an already effective global Pro model,
an existing company and the exact Pro
model. It retains the shared measured-usage ledger and accepts no arbitrary
model/endpoint. The ordinary route keeps its configured model restriction.

Owning regression: actual isolated SurrealDB transactions with a synthetic
corpus, fake paid-provider responses, exact content/citation IDs, write fence,
resume, missing/extra scope, pending commands, invalid vectors/model/usage,
budget and unknown-request refusal, stale CAS, tampered targets and abort.
These regressions are not production corpus migration or real provider proof.
