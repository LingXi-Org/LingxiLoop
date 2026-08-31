# Native Open Notebook knowledge engine

LingxiLoop builds the audited Open Notebook backend and worker from
`third_party/open-notebook` (base commit
`a7de90d38aaf18ee85fd661854d35c11e44613e2`). It is the only v1 knowledge
engine: PostgreSQL does not parse, chunk, embed, or search source contents. The
production artifact is the `lingxiloop-rag` Docker target, not the upstream
application image. It contains no Next.js/Node runtime and starts exactly the
`rag-api` and `rag-worker` Supervisor programs.

## Deployment boundary

The Compose stacks start `open-notebook` and a digest-pinned `surrealdb` on a
dedicated internal backplane. Open Notebook additionally has an isolated
egress-only bridge for provider and URL access; Agent OS is attached to neither
knowledge network. Only the LingxiLoop server spans the application and
knowledge backplanes, and neither knowledge service publishes a host port. Browsers keep using
LingxiLoop's existing `/projects/:id/sources` and `/conversations/:id/sources`
routes; Agent OS also reaches knowledge only through the LingxiLoop Host
Bridge.

The internal API is an allowlist for notebook creation/update, asynchronous
Source creation/status/retry/delete, Source-only scoped search, `/health`, and
`/readyz`. Ask, Notes, Insights, Transformations, Chat, Source Chat, Podcasts,
model/credential settings, generic command endpoints, API docs and the Open
Notebook UI are not registered. The Worker imports only the Source ingestion
command. `/readyz` proves the database schema, object store, configured
embedding model, and a real embedding request. The container health check also
requires both the `rag-api` and `rag-worker` Supervisor processes to be running.

Production must provide:

- `OPEN_NOTEBOOK_IMAGE`: a digest-pinned
  `ghcr.io/lingxi-org/lingxiloop-open-notebook` image built by CI and recorded
  beside the other three images in `.release.next.env`;
- `OPEN_NOTEBOOK_PASSWORD` in `.env.secrets`;
- `OPEN_NOTEBOOK_SURREAL_PASSWORD` to Compose interpolation;
- `OPENAI_EMBEDDING_MODEL` for the one supported embedding model. Open Notebook
  reaches it only through LingxiLoop's authenticated internal embedding proxy.

Open Notebook does not receive the complete `.env.secrets` file. Compose
injects only the internal password, SurrealDB connection, four private R2
values, Worker limit, and the fixed internal proxy endpoint/model. There is no
provider credential or generation-model configuration in Open Notebook. Every
embedding call passes through LingxiLoop and is recorded in `llm_calls`.

The v1 release requires the knowledge service for knowledge operations. If it
is unavailable, those operations fail explicitly; ordinary messaging remains
an independent domain and continues to operate.

## Artifact storage

Open Notebook reuses LingxiLoop's private R2 bucket. `R2_ENDPOINT`,
`R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` are required.
Uploaded Source originals live once under `knowledge-sources/`. Open Notebook
receives only the canonical storage key, reads that private object during
extraction, and never owns or copies it. Parser-owned derived artifacts may use
`OPEN_NOTEBOOK_R2_PREFIX` (default `open-notebook/`). Objects are represented
internally as opaque `r2://` references.
There is no local-filesystem object-storage mode and browsers upload through
presigned PUT only.

SurrealDB data and parser/model caches remain on their existing persistent
volumes. They are databases or disposable caches and are not suitable for
object storage. The RAG image creates no Chat checkpoints or Podcast storage.

## Scope contract

Each Project owns exactly one extraction/index Notebook with external key
`lingxiloop:project:<projectId>`. A Notebook and `conversation_id` are not
authorization boundaries. PostgreSQL first resolves the calling user's Source
allowlist to exact-Project `PROJECT` Sources plus `PRIVATE` Sources owned by the
caller's `authorizationUserId`, then applies that user's conversation
exclusions. Only that allowlist is sent to Open Notebook, where it is
intersected with Notebook relationships before SurrealDB searches or ranks any
candidate. Owner, Teacher, and TA roles do not bypass a different user's
`PRIVATE` ownership. Group and direct Agent conversations use this same
authorized Project resolution; a direct conversation does not grant broader
Source access.

The supported integration contract is Source-only: private object upload,
content extraction, chunking/embedding, ingestion-state synchronization, and
scoped retrieval of citation-ready excerpts. The LingxiLoop gateway never
accepts or returns Open Notebook external IDs to a browser or Agent.

Presentation generation uses the internal
`GET /api/sources/{source_id}/presentation-material` boundary. Its only valid
success shape is `PresentationMaterialV1`: bounded structured text blocks with
chunk, page and section provenance plus source-owned image assets when the
ingestion pipeline retained them. If page/section metadata is unavailable, the
response retains the source/chunk relationship and uses nullable layout fields;
it never invents coordinates or drops provenance. The endpoint is available
only for fully embedded Sources and never returns an object-store key or a
LingxiLoop-local Source ID. The control plane maps the external ID back to its
authorized local Source before any evidence reaches a model, browser or deck.

## Initialization

Open Notebook startup applies exactly `open_notebook/rag/schema.surrealql` to
an empty store and records the native-v1 schema marker. A non-empty unmarked
store is rejected. There is no migration chain, dual read, alternative RAG
engine, compatibility index, or old knowledge import. Follow the guarded empty
environment procedure in `docs/RELEASE.md`.
