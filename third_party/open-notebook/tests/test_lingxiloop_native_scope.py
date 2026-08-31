"""Static contract for LingxiLoop's production RAG-only integration."""

from pathlib import Path

ROOT = Path(__file__).parent.parent


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_rag_api_is_an_explicit_allowlist() -> None:
    main = read("api/rag_main.py")
    router = read("api/rag_router.py")
    assert "docs_url=None" in main
    assert "openapi_url=None" in main
    assert router.count("@router.") == 9
    for route in (
        'post("/notebooks"',
        'put("/notebooks/{notebook_id}"',
        'post("/sources/json"',
        'post("/sources"',
        'get("/sources/{source_id}"',
        'get("/sources/{source_id}/status"',
        'post("/sources/{source_id}/retry"',
        'delete("/sources/{source_id}"',
        'post("/search"',
    ):
        assert route in router


def test_rag_worker_registers_only_process_source() -> None:
    commands = read("rag_commands.py")
    supervisor = read("supervisord.rag.conf")
    assert commands.count("@command(") == 1
    assert '"process_source"' in commands
    assert "embed_source" not in commands
    assert "transformation" not in commands.lower()
    assert "--import-modules rag_commands" in supervisor
    assert "--import-modules commands" not in supervisor


def test_rag_runtime_does_not_import_upstream_extraction_or_chunking() -> None:
    ingestion = read("open_notebook/rag/ingestion.py")
    extraction = read("open_notebook/rag/extraction.py")
    chunking = read("open_notebook/rag/chunking.py")
    assert "content_core" not in ingestion
    assert "open_notebook.utils.chunking" not in ingestion
    assert "content_core" not in extraction
    assert "langchain" not in chunking


def test_source_only_migration_is_latest() -> None:
    migration = read("open_notebook/database/migrations/25.surrealql")
    manager = read("open_notebook/database/async_migrate.py")
    assert "FROM source_embedding" in migration
    assert "source.id AS parent_id" in migration
    assert "FROM source_insight" not in migration
    assert "FROM note" not in migration
    assert "migrations/25.surrealql" in manager
    assert "migrations/25_down.surrealql" in manager


def test_rag_image_has_no_frontend_or_general_command_runtime() -> None:
    dockerfile = read("Dockerfile")
    target = dockerfile.split("FROM python:3.12-slim-trixie AS lingxiloop-rag", 1)[1]
    target = target.split("FROM runtime-base AS runtime", 1)[0]
    assert "node" not in target.lower()
    assert "frontend" not in target.lower()
    assert "8502" not in target
    assert "COPY commands" not in target
    assert "domain/notebook.py" not in target
    assert "COPY open_notebook/utils /app" not in target
    assert "supervisord.rag.conf" in target


def test_embedding_contract_never_persists_the_api_key() -> None:
    runtime = read("open_notebook/rag/runtime.py")
    assert "rag_embedding_contract" in runtime
    function = runtime.split("async def persist_embedding_contract", 1)[1].split(
        "async def initialize_runtime", 1
    )[0]
    assert "CREATE open_notebook:rag_embedding_contract" in function
    assert "UPDATE open_notebook:rag_embedding_contract" in function
    assert "base_url" in function
    assert "dimensions" in function
    assert "api_key" not in function.lower()
