# Native Open Notebook knowledge engine

LingxiLoop builds the audited Open Notebook backend and worker from
`third_party/open-notebook` (base commit
`a7de90d38aaf18ee85fd661854d35c11e44613e2`). It is the only v1 knowledge
engine: PostgreSQL does not parse, chunk, embed, or search source contents.

## Deployment boundary

The Compose stacks start `open-notebook` and a digest-pinned `surrealdb` on a
dedicated internal backplane. Open Notebook additionally has an isolated
egress-only bridge for provider and URL access; Agent OS is attached to neither
knowledge network. Only the LingxiLoop server spans the application and
knowledge backplanes, and neither knowledge service publishes a host port. Browsers keep using
LingxiLoop's existing `/projects/:id/sources` and `/conversations/:id/sources`
routes; Agent OS also reaches knowledge only through the LingxiLoop Host
Bridge.

Production must provide:

- `OPEN_NOTEBOOK_IMAGE`: a digest-pinned
  `ghcr.io/lingxi-org/lingxiloop-open-notebook` image built by CI and recorded
  beside the other three images in `.release.next.env`;
- `OPEN_NOTEBOOK_PASSWORD` and `OPEN_NOTEBOOK_ENCRYPTION_KEY` in
  `.env.secrets`;
- `OPEN_NOTEBOOK_SURREAL_PASSWORD` to Compose interpolation;
- Open Notebook provider credentials, default embedding/extraction models,
  and transformations through its internal operations configuration;
- `OPEN_NOTEBOOK_CHAT_MODEL` or the three stage-specific model record IDs for
  Agent `loop.knowledge.ask()`.

`OPEN_NOTEBOOK_ENABLED=false` disables the knowledge gateway and workers while
leaving ordinary messaging available. This is an availability switch, not a
legacy-RAG fallback.

## Artifact storage

Open Notebook reuses LingxiLoop's existing private R2 bucket. When
`R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` are
all set, `OPEN_NOTEBOOK_R2_ENABLED=auto` persists uploaded Source originals and
generated Podcast audio under `OPEN_NOTEBOOK_R2_PREFIX` (default
`open-notebook/`). Objects are represented internally as opaque `r2://`
references and are never exposed as direct bucket URLs; authenticated APIs
stream them to callers. If R2 is not configured, the upstream-compatible local
filesystem behavior remains active.

SurrealDB data, LangGraph SQLite checkpoints, and parser/model/browser caches
remain on their existing persistent volume. They are databases or disposable
node caches and are not suitable for object storage.

## Scope contract

Each Project owns exactly one Notebook with external key
`lingxiloop:project:<projectId>`. Search and Ask require a Notebook and resolve
Source allow/exclude IDs from Notebook relationships before SurrealDB ranks
candidates. Source Chat verifies the same Notebook–Source relationship. The
LingxiLoop gateway never accepts or returns those external IDs to a browser or
Agent.

## Cutover

The `open_notebook_native_v1` schema cutover intentionally deletes old local
knowledge sources and drops the retired chunk table and content columns. No
migration, dual read, or pgvector RAG fallback is performed. Re-upload sources
after the first native deployment.
