# #477 source search backend handoff

Base: `06e4a364` (`origin/main`, 2026-10-25). Local development only; this
backend change is for the parent integrator to combine with the separately
delivered #474 original-file viewer and #477 sidebar. No production operations.

## Inspected index and anchor contract

- [RAG schema](../../../third_party/open-notebook/open_notebook/rag/schema.surrealql)
  stores source embedding record IDs, source relation, ordinal, content and
  embedding. The scoped vector result has the chunk ID, parent source ID and
  content. There are no stored character offsets, bounding boxes, slide IDs or
  sheet/cell addresses in this retrieval contract.
- [PDF extraction](../../../third_party/open-notebook/open_notebook/rag/extraction.py)
  inserts `[[PAGE:n]]` into extracted text.
  [Embedding ingestion](../../../third_party/open-notebook/open_notebook/rag/ingestion.py)
  can carry a preceding marker into later chunks. Such markers do not establish
  a stable original-file page or region for a whole matching chunk.
- The API therefore returns only an exact, unique excerpt's UTF-16 offsets in
  the returned extracted-text snapshot. Ambiguous or absent substrings receive
  `anchor: null` and retain the actual server excerpt. It never fabricates page
  numbers, layout boxes, semantic edges, similarity scores or hit rates.
- Upstream source GET stamps `last_viewed_at`, which changes upstream `updated`
  through the schema. That timestamp is unsuitable as an index version.

## Existing project-source API extension

`POST /projects/:id/sources/:sourceId/search`

```json
{ "query": "How does attention work?", "limit": 8, "indexVersion": "optional prior version token" }
```

The route uses the existing `requireWorkspace(..., 'knowledge:read')` and a
strict body schema. The service reuses `OpenNotebookClient.search(type: 'vector')`
with the server-resolved single source ID, company and notebook. There is no
new embedding, vector store or processing path. Both initial and final reads
require project authorization and the existing PROJECT/own-PRIVATE visibility
predicate. Provider responses are independently filtered to the one source.

The response shape is exported as `KnowledgeSourceSearch` in server and web
contracts and exposed by `knowledgeApi.searchProjectSource(projectId, sourceId,
input, signal)`:

```ts
{
  sourceId: string
  indexVersion: string | null
  status: 'matched' | 'no_matches' | 'processing' | 'not_indexed' | 'stale'
  extractedText: string | null
  matches: Array<{
    sourceId: string
    sourceTitle: string
    chunkId: string
    excerpt: string
    anchor: { type: 'extracted_text'; start: number; end: number } | null
  }>
}
```

`indexVersion` hashes the exact PostgreSQL source update timestamp, external
source ID, chunk count, upstream command and text snapshot. Search rechecks
both upstream content and persisted authorization/index state before returning
evidence. A prior version mismatch or missing/changed upstream index returns
`stale` with no text or matches. The client must discard previous anchors and
refresh/rerun without the old version. A genuine upstream outage returns 503,
so it cannot appear as a successful query with no matches.

Stored/failed/upload-pending/unindexed sources return `not_indexed`; queued or
processing sources return `processing`. Neither branch reads upstream text or
produces hits. Response closure aborts upstream source reads and search; source
reads retain their normal bounded timeout.

## Focused verification

- `npm run server:typecheck` and `npm run typecheck`: passed.
- Biome lint of every changed TypeScript file and `git diff --check`: passed.
- Six focused tests: exact/ambiguous anchors, strict input, existing retrieval,
  bounded/cancellable search HTTP, original source API regression, and new
  client route/body/signal binding: passed, zero failures/skips.
- Owning `knowledge-vertical-slice.test.ts`: 18 passed, zero failures/skips.
  [Machine-readable result](backend-integration-results.json). This uses the
  dedicated `lingxiloop_materials_477_test` PostgreSQL database at local Docker
  port 55432 and Redis database 12 at port 56379, following the existing public
  synthetic fixture environment in `docs/evidence/issue-449/integration-env.sh`.
  It covers real SQL permissions and HTTP routing, own-private versus other
  student/teacher access, course/tenant boundaries, stored PPTX and failed/pending
  suppression, single-source vector requests, stable snapshots after repeated
  views, stale versions/content, membership revocation during search, removed
  upstream indexes and outages. Only the Notebook provider is a fixture.

The integration does **not** establish actual semantic retrieval quality or
completed PDF/Markdown ingestion. Real Notebook query and browser acceptance
remain with the parent integrator after #474; the final combined candidate
still needs its independent review and CI.
