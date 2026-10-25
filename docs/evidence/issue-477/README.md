# Issue 477 — semantic source evidence

Depends on phase-one original-file viewer PR #485. This branch targets that
branch; #474 does not depend on semantic evidence.

The preview lazily offers “语义命中” only for ready sources with indexed chunks.
The server executes the existing Notebook vector query with one authorized
source ID, returning actual chunk IDs/excerpts and a versioned text snapshot.
Repeated or unmatched text has no invented location. Retab's own text viewer
highlights verified parsed-text lines; the UI explicitly says original pages
and regions are unavailable. The bounded evidence list adapts Retab's actual
SourceFieldList/InteractiveItemList with MIT originals and provenance retained.

No stable PDF boxes/pages, Office sheets/slides or raw-text offsets exist in the
current index. PDF page markers are not elevated into a coordinate contract.
No new index, embedding pipeline, renderer, fabricated scores or hit rates.

Scope/version changes discard selection; queries consume cancellation signals.
Parsed-text resources use a distinct per-scope Blob so they do not enter Retab's
shared string-resource registry. Stored/failed/unindexed sources have no semantic
mode; source authorization is checked before and again after upstream search.

- [Backend contract, actual anchor audit and checks](backend.md)
- [Frontend composition and pinned source](frontend.md)
- Owning integration: 18 passed using real isolated PostgreSQL permissions and a
  Notebook provider fixture. This is not a live embedding-service result.
- Focused frontend/source/client checks: 4 passed after final preview binding.
- Backend focused checks, Web/Node+server typechecks and changed-file lint passed.

Real Notebook PDF/Markdown ingestion/query browser acceptance has not run. The
available original-format browser harness establishes #474 rendering only;
it does not supply semantic provider results. No production writes or deployment.
