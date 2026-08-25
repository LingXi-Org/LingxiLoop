"""Regression contract for LingxiLoop's native Open Notebook integration.

These tests intentionally use only the standard library so the repository can
validate its tenant-boundary wiring before the full Open Notebook environment
and SurrealDB integration suite are available.
"""

from pathlib import Path

ROOT = Path(__file__).parent.parent


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_search_and_ask_require_notebook_scope() -> None:
    models = read("api/models.py")
    assert "class SearchRequest" in models
    assert "class AskRequest" in models
    assert models.count('notebook_id: str = Field(..., description="Notebook that bounds') == 2
    assert models.count("source_ids: Optional[List[str]]") == 2
    assert models.count("excluded_source_ids: List[str]") == 2


def test_scope_is_resolved_from_notebook_relationships() -> None:
    router = read("api/routers/search.py")
    assert "if requested_source_ids is not None" in router
    assert "notebook_sources.intersection(requested)" in router
    assert "allowed_sources.difference_update(excluded_source_ids)" in router
    assert "source_ids=source_ids" in router
    assert "note_ids=note_ids" in router


def test_surreal_search_filters_candidates_before_ranking() -> None:
    migration = read("open_notebook/database/migrations/24.surrealql")
    assert migration.count("source.id IN $source_ids") >= 3
    assert migration.count("id IN $note_ids") >= 3
    assert "fn::scoped_vector_search" in migration
    assert "fn::scoped_text_search" in migration
    manager = read("open_notebook/database/async_migrate.py")
    assert "migrations/24.surrealql" in manager
    assert "migrations/24_down.surrealql" in manager


def test_ask_graph_propagates_the_resolved_scope() -> None:
    ask = read("open_notebook/graphs/ask.py")
    assert '"source_ids": state["source_ids"]' in ask
    assert '"note_ids": state["note_ids"]' in ask
    assert "source_ids=state[\"source_ids\"]" in ask
    assert "note_ids=state[\"note_ids\"]" in ask


def test_source_chat_requires_the_source_notebook_relationship() -> None:
    source_chat = read("api/routers/source_chat.py")
    assert source_chat.count('notebook_id: str = Field(..., description="Notebook that owns the source")') == 2
    assert "WHERE out=$notebook_id AND in=$source_id" in source_chat
    assert source_chat.count("verify_source_notebook_scope(request.notebook_id") == 2


def test_notebook_external_key_is_unique_and_idempotent() -> None:
    notebook_router = read("api/routers/notebooks.py")
    migration = read("open_notebook/database/migrations/24.surrealql")
    assert "WHERE external_key = $external_key LIMIT 1" in notebook_router
    assert "idx_notebook_external_key" in migration
    assert "UNIQUE" in migration


def test_insight_updates_are_available_to_the_approved_host_surface() -> None:
    models = read("api/models.py")
    router = read("api/routers/insights.py")
    assert "class SourceInsightUpdate" in models
    assert '@router.put("/insights/{insight_id}"' in router
    assert "async def update_insight" in router
