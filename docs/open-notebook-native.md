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

The v1 release requires the knowledge service for knowledge operations. If it
is unavailable, those operations fail explicitly; ordinary messaging remains
an independent domain and continues to operate.

## Artifact storage

Open Notebook reuses LingxiLoop's private R2 bucket. `R2_ENDPOINT`,
`R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE`
and `R2_URL_SIGNING_SECRET` are required. Uploaded Source originals and
generated Podcast audio live under `OPEN_NOTEBOOK_R2_PREFIX` (default
`open-notebook/`). Objects are represented internally as opaque `r2://`
references; authenticated APIs resolve them without exposing credentials.
There is no local-filesystem object-storage mode and browsers upload through
presigned PUT only.

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

## Initialization

Open Notebook and LingxiLoop are initialized only as the complete v1 shape.
There is no migration, dual read, alternative RAG engine, or in-place upgrade
path. Rebuild non-v1 development environments before release.
