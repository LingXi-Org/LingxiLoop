from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError


def test_route_table_is_exact() -> None:
    from api.rag_main import app

    routes = {
        (method, route.path)
        for route in app.routes
        for method in getattr(route, "methods", set())
    }
    assert routes == {
        ("GET", "/health"),
        ("GET", "/readyz"),
        ("POST", "/api/notebooks"),
        ("PUT", "/api/notebooks/{notebook_id}"),
        ("POST", "/api/sources/json"),
        ("GET", "/api/sources/{source_id}"),
        ("GET", "/api/sources/{source_id}/status"),
        ("GET", "/api/sources/{source_id}/presentation-material"),
        ("POST", "/api/sources/{source_id}/retry"),
        ("DELETE", "/api/sources/{source_id}"),
        ("POST", "/api/search"),
    }


@pytest.mark.asyncio
async def test_presentation_material_is_bounded_and_keeps_provenance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from api import rag_router

    source = SimpleNamespace(
        id="source:test",
        title="Evidence source",
        asset=None,
        get_embedded_chunks=AsyncMock(return_value=2),
    )
    monkeypatch.setattr(rag_router.Source, "get", AsyncMock(return_value=source))
    monkeypatch.setattr(
        rag_router,
        "repo_query",
        AsyncMock(
            return_value=[
                {
                    "id": "source_embedding:first",
                    "order": 0,
                    "content": "[[PAGE:7]]\n# Findings\nGrounded result",
                },
                {
                    "id": "source_embedding:second",
                    "order": 1,
                    "content": "Supporting detail",
                },
            ]
        ),
    )

    response = await rag_router.get_presentation_material("source:test")

    assert response.model_dump() == {
        "version": "PresentationMaterialV1",
        "source_id": "source:test",
        "title": "Evidence source",
        "blocks": [
            {
                "chunk_id": "source_embedding:first",
                "ordinal": 0,
                "text": "# Findings\nGrounded result",
                "page_number": 7,
                "section_title": "Findings",
            },
            {
                "chunk_id": "source_embedding:second",
                "ordinal": 1,
                "text": "Supporting detail",
                "page_number": 7,
                "section_title": "Findings",
            },
        ],
        "assets": [],
        "truncated": False,
    }


def test_presentation_asset_is_source_inline_and_bounded() -> None:
    from api import rag_router

    asset = rag_router._presentation_asset(
        b"source-image", name="figure.png", page_number=3, width=640, height=360
    )

    assert asset is not None
    assert asset.asset_id.startswith("presentation_asset:")
    assert asset.mime_type == "image/png"
    assert asset.data_uri.startswith("data:image/png;base64,")
    assert asset.page_number == 3
    assert (
        rag_router._presentation_asset(
            b"x" * (rag_router.MAX_PRESENTATION_ASSET_BYTES + 1),
            name="oversized.png",
            page_number=1,
        )
        is None
    )


def test_source_create_rejects_removed_controls() -> None:
    from api.rag_models import SourceJsonCreate

    with pytest.raises(ValidationError):
        SourceJsonCreate(
            type="text",
            notebooks=["notebook:1"],
            content="hello",
            transformations=[],
            embed=True,
            async_processing=True,
        )


def test_search_requires_source_allowlist_and_rejects_note_controls() -> None:
    from api.rag_models import SearchRequest

    with pytest.raises(ValidationError):
        SearchRequest(query="hello", notebook_id="notebook:1")
    with pytest.raises(ValidationError):
        SearchRequest(
            query="hello",
            notebook_id="notebook:1",
            source_ids=[],
        )
    with pytest.raises(ValidationError):
        SearchRequest(
            query="hello",
            notebook_id="notebook:1",
            source_ids=["source:1"],
            search_notes=True,
        )
    with pytest.raises(ValidationError):
        SearchRequest(
            query="hello",
            notebook_id="notebook:1",
            source_ids=["source:1"],
            excluded_source_ids=["source:2"],
        )


@pytest.mark.asyncio
async def test_bootstrap_uses_only_the_configured_embedding_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from open_notebook.rag import runtime

    monkeypatch.setenv("OPENAI_API_KEY", "test-secret")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://embedding.example/v1/")
    monkeypatch.setenv("OPENAI_EMBEDDING_MODEL", "embedding-v1")
    monkeypatch.setattr(runtime, "validate_url", AsyncMock())
    calls: list[tuple[str, object]] = []

    async def fake_query(query: str, variables=None):
        calls.append((query, variables))
        if "rag_embedding_contract" in query and query.lstrip().startswith("SELECT"):
            return []
        if "count() AS count FROM source_embedding" in query:
            return []
        return []

    monkeypatch.setattr(runtime, "repo_query", fake_query)
    result = await runtime.bootstrap_embedding_model()

    assert result == ("embedding-v1", "embedding-v1", "https://embedding.example/v1")
    serialized_calls = repr(calls)
    assert "test-secret" not in serialized_calls
    assert "default_models" not in serialized_calls


@pytest.mark.asyncio
async def test_bootstrap_rejects_changed_endpoint_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from open_notebook.exceptions import ConfigurationError
    from open_notebook.rag import runtime

    monkeypatch.setenv("OPENAI_API_KEY", "test-secret")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://new.example/v1")
    monkeypatch.setenv("OPENAI_EMBEDDING_MODEL", "embedding-v1")
    monkeypatch.setattr(runtime, "validate_url", AsyncMock())
    monkeypatch.setattr(
        runtime,
        "repo_query",
        AsyncMock(
            return_value=[
                {
                    "model": "embedding-v1",
                    "base_url": "https://old.example/v1",
                    "dimensions": 3,
                }
            ]
        ),
    )

    with pytest.raises(ConfigurationError, match="contract changed"):
        await runtime.bootstrap_embedding_model()


@pytest.mark.asyncio
async def test_embedding_contract_rejects_changed_dimensions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from open_notebook.exceptions import ConfigurationError
    from open_notebook.rag import contract

    monkeypatch.setenv("OPENAI_API_KEY", "test-secret")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://embedding.example/v1/")
    monkeypatch.setenv("OPENAI_EMBEDDING_MODEL", "embedding-v1")
    monkeypatch.setattr(
        contract,
        "repo_query",
        AsyncMock(
            return_value=[
                {
                    "model": "embedding-v1",
                    "base_url": "https://embedding.example/v1",
                    "dimensions": 3,
                }
            ]
        ),
    )

    with pytest.raises(ConfigurationError, match="dimensions changed"):
        await contract.validate_embedding_vectors([[0.1, 0.2]])


@pytest.mark.asyncio
async def test_embedding_contract_uses_explicit_created_timestamp(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from open_notebook.rag import runtime

    query = AsyncMock(side_effect=[[], []])
    monkeypatch.setattr(runtime, "repo_query", query)

    await runtime.persist_embedding_contract(
        model_id="model:rag",
        model="embedding-v1",
        base_url="https://embedding.example/v1",
        dimensions=3,
    )

    statement = query.await_args_list[1].args[0]
    assert "CREATE open_notebook:rag_embedding_contract" in statement
    assert "created = time::now()" in statement
    assert "created OR" not in statement


@pytest.mark.asyncio
async def test_r2_readiness_round_trips_and_deletes_a_probe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from open_notebook.rag import runtime

    client = MagicMock()
    body = MagicMock()
    body.read.return_value = b"lingxiloop-rag-readiness"
    client.get_object.return_value = {"Body": body}
    store = SimpleNamespace(
        enabled=True,
        bucket="knowledge",
        prefix="open-notebook",
        client=client,
    )
    monkeypatch.setattr(runtime, "get_artifact_store", lambda: store)

    await runtime.probe_r2_access()

    client.put_object.assert_called_once()
    client.get_object.assert_called_once()
    client.delete_object.assert_called_once()
    put_call = client.put_object.call_args.kwargs
    get_call = client.get_object.call_args.kwargs
    delete_call = client.delete_object.call_args.kwargs
    assert put_call["Bucket"] == get_call["Bucket"] == delete_call["Bucket"]
    assert put_call["Key"] == get_call["Key"] == delete_call["Key"]
    assert put_call["Key"].startswith("open-notebook/readiness/")
    body.close.assert_called_once_with()


@pytest.mark.asyncio
async def test_embedding_failure_never_deletes_existing_chunks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from open_notebook.rag import ingestion

    source = SimpleNamespace(
        id="source:1",
        full_text="LingxiLoop unique retrieval phrase",
        asset=None,
        company_id="company:test",
    )
    monkeypatch.setattr(ingestion, "chunk_text", lambda *args, **kwargs: ["chunk"])
    monkeypatch.setattr(
        ingestion,
        "generate_embeddings",
        AsyncMock(side_effect=RuntimeError("provider unavailable")),
    )
    query = AsyncMock()
    monkeypatch.setattr(ingestion, "repo_query", query)

    with pytest.raises(RuntimeError, match="provider unavailable"):
        await ingestion.replace_source_embeddings(source)

    query.assert_not_awaited()


@pytest.mark.asyncio
async def test_chunk_replacement_is_one_transaction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from open_notebook.rag import ingestion

    source = SimpleNamespace(id="source:1", full_text="unique phrase", asset=None, company_id="company:test")
    monkeypatch.setattr(ingestion, "chunk_text", lambda *args, **kwargs: ["chunk"])
    monkeypatch.setattr(
        ingestion, "generate_embeddings", AsyncMock(return_value=[[0.1, 0.2]])
    )
    monkeypatch.setattr(
        ingestion, "validate_embedding_vectors", AsyncMock(return_value=2)
    )
    statements = AsyncMock(return_value=[])
    query = AsyncMock(return_value=[{"chunks": 1}])
    monkeypatch.setattr(ingestion, "repo_query_statements", statements)
    monkeypatch.setattr(ingestion, "repo_query", query)

    assert await ingestion.replace_source_embeddings(source) == 1
    transaction = statements.await_args_list[0].args[0]
    assert "BEGIN TRANSACTION" in transaction
    assert "DELETE source_embedding" in transaction
    assert "CREATE source_embedding" in transaction
    assert "COMMIT TRANSACTION" in transaction


@pytest.mark.asyncio
async def test_search_scope_excludes_sources_without_embeddings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from api import rag_router
    from api.rag_models import SearchRequest

    monkeypatch.setattr(rag_router, "_verify_notebooks", AsyncMock())
    query = AsyncMock(side_effect=[["source:test"], []])
    monkeypatch.setattr(rag_router, "repo_query", query)
    generate = AsyncMock()
    monkeypatch.setattr(rag_router, "generate_query_embedding", generate)

    response = await rag_router.search(
        SearchRequest(
            query="unique phrase",
            notebook_id="notebook:test",
            source_ids=["source:test"],
            company_id="company:test",
        )
    )

    assert response.results == []
    assert response.total_count == 0
    generate.assert_not_awaited()
    assert "source_embedding" in query.await_args_list[1].args[0]


@pytest.mark.asyncio
async def test_url_target_is_public_only_and_dns_pinned(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from open_notebook.exceptions import InvalidInputError
    from open_notebook.rag import extraction

    monkeypatch.setattr(
        extraction.socket,
        "getaddrinfo",
        lambda *args, **kwargs: [
            (
                extraction.socket.AF_INET,
                extraction.socket.SOCK_STREAM,
                6,
                "",
                ("93.184.216.34", 443),
            )
        ],
    )
    target = await extraction.prepare_public_http_target(
        "https://example.com/knowledge?q=rag"
    )
    assert target.url == "https://93.184.216.34/knowledge?q=rag"
    assert target.headers == {"Host": "example.com"}
    assert target.extensions == {"sni_hostname": "example.com"}

    with pytest.raises(InvalidInputError, match="non-public"):
        await extraction.prepare_public_http_target("http://127.0.0.1/private")


def test_rag_upload_allowlist_excludes_removed_media_types() -> None:
    from open_notebook.rag.extraction import ALLOWED_FILE_SUFFIXES

    assert ALLOWED_FILE_SUFFIXES == {
        ".pdf",
        ".docx",
        ".txt",
        ".md",
        ".markdown",
        ".csv",
        ".json",
    }


def test_file_limit_leaves_bounded_multipart_overhead() -> None:
    from api.rag_main import RAG_FILE_MAX_SIZE, RAG_REQUEST_MAX_SIZE

    assert RAG_FILE_MAX_SIZE == 200 * 1024 * 1024
    assert RAG_REQUEST_MAX_SIZE > RAG_FILE_MAX_SIZE
    assert RAG_REQUEST_MAX_SIZE - RAG_FILE_MAX_SIZE <= 1024 * 1024


def test_file_metadata_uses_the_shared_source_limit() -> None:
    from api.rag_models import SourceJsonCreate
    from open_notebook.rag.extraction import MAX_SOURCE_BYTES

    payload = {
        "type": "file",
        "notebooks": ["notebook:1"],
        "storage_key": "knowledge-sources/company/project/source.pdf",
        "filename": "source.pdf",
        "mime_type": "application/pdf",
        "company_id": "company:1",
    }
    assert SourceJsonCreate(**payload, size_bytes=MAX_SOURCE_BYTES).size_bytes == MAX_SOURCE_BYTES
    with pytest.raises(ValidationError):
        SourceJsonCreate(**payload, size_bytes=MAX_SOURCE_BYTES + 1)


def test_upload_mime_must_match_the_supported_extension() -> None:
    from fastapi import HTTPException

    from api import rag_router

    rag_router._validate_upload_media_type("evidence.pdf", "application/pdf")
    rag_router._validate_upload_media_type(
        "evidence.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    with pytest.raises(HTTPException) as mismatch:
        rag_router._validate_upload_media_type("evidence.pdf", "text/plain")
    assert mismatch.value.status_code == 415
    with pytest.raises(HTTPException) as missing:
        rag_router._validate_upload_media_type("evidence.pdf", None)
    assert missing.value.status_code == 415


@pytest.mark.asyncio
async def test_text_source_uses_the_same_utf8_size_ceiling(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from fastapi import HTTPException

    from api import rag_router
    from api.rag_models import SourceJsonCreate

    monkeypatch.setattr(rag_router, "MAX_SOURCE_BYTES", 4)
    queue = AsyncMock()
    monkeypatch.setattr(rag_router, "_queue_source", queue)

    with pytest.raises(HTTPException) as oversized:
        await rag_router.create_json_source(
            SourceJsonCreate(type="text", notebooks=["notebook:1"], content="12345", company_id="company:1"),
            SimpleNamespace(headers={"Idempotency-Key": "source-test"}),
        )

    assert oversized.value.status_code == 413
    queue.assert_not_awaited()


@pytest.mark.asyncio
async def test_post_extraction_text_is_bounded(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from open_notebook.exceptions import InvalidInputError
    from open_notebook.rag import extraction

    monkeypatch.setattr(extraction, "MAX_SOURCE_BYTES", 4)
    monkeypatch.setattr(
        extraction,
        "_extract_url",
        AsyncMock(
            return_value=extraction.ExtractedContent(title=None, content="12345")
        ),
    )

    with pytest.raises(InvalidInputError, match="Extracted text"):
        await extraction.extract_content(url="https://example.com")


def test_docx_zip_expansion_is_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    from open_notebook.exceptions import InvalidInputError
    from open_notebook.rag import extraction

    path = Path(__file__).with_name(".oversized-rag-test.docx")
    entries = [
        SimpleNamespace(filename="[Content_Types].xml", file_size=1),
        SimpleNamespace(
            filename="word/document.xml",
            file_size=extraction.MAX_DOCX_UNCOMPRESSED_BYTES,
        ),
    ]

    class Archive:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def infolist(self):
            return entries

    monkeypatch.setattr(extraction.zipfile, "ZipFile", lambda path: Archive())

    try:
        path.write_bytes(b"PK")
        with pytest.raises(InvalidInputError, match="safety limit"):
            extraction.validate_supported_file(str(path))
    finally:
        path.unlink(missing_ok=True)


@pytest.mark.asyncio
async def test_raw_surreal_query_checks_every_statement(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from open_notebook.database import repository

    connection = SimpleNamespace(
        query_raw=AsyncMock(
            return_value={
                "result": [
                    {"status": "OK", "result": []},
                    {"status": "ERR", "result": "second statement failed"},
                ]
            }
        )
    )

    @asynccontextmanager
    async def connection_context():
        yield connection

    monkeypatch.setattr(repository, "db_connection", connection_context)

    with pytest.raises(RuntimeError, match="statement 2"):
        await repository.repo_query_statements("RETURN 1; THROW 'failed';")


@pytest.mark.asyncio
async def test_migration_version_is_not_bumped_after_a_statement_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from open_notebook.database import async_migrate

    statements = AsyncMock(side_effect=RuntimeError("statement 2 failed"))
    bump = AsyncMock()
    monkeypatch.setattr(async_migrate, "repo_query_statements", statements)
    monkeypatch.setattr(async_migrate, "bump_version", bump)

    with pytest.raises(RuntimeError, match="statement 2"):
        await async_migrate.AsyncMigration("RETURN 1; THROW 'failed';").run()

    bump.assert_not_awaited()


@pytest.mark.asyncio
async def test_exact_models_reject_cross_table_ids_before_querying(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from open_notebook.exceptions import NotFoundError
    from open_notebook.rag import models

    query = AsyncMock()
    monkeypatch.setattr(models, "repo_query", query)

    with pytest.raises(NotFoundError):
        await models.Source.get("notebook:not-a-source")

    query.assert_not_awaited()


@pytest.mark.asyncio
async def test_missing_command_status_fails_closed() -> None:
    from open_notebook.exceptions import DatabaseOperationError
    from open_notebook.rag.models import Source

    source = Source(id="source:test", company_id="company:test")
    with pytest.raises(DatabaseOperationError, match="no processing command"):
        await source.get_status()


@pytest.mark.asyncio
async def test_r2_delete_failure_keeps_the_source_record(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from open_notebook.domain.base import ObjectModel
    from open_notebook.exceptions import ExternalServiceError
    from open_notebook.rag import models

    source = models.Source(
        id="source:test", company_id="company:test", asset=models.Asset(file_path="r2://open-notebook/sources/x")
    )
    monkeypatch.setattr(
        models, "repo_query", AsyncMock(return_value=[{"id": "source:test"}])
    )
    store = SimpleNamespace(delete=MagicMock(side_effect=RuntimeError("R2 denied")))
    monkeypatch.setattr(models, "get_artifact_store", lambda: store)
    release = AsyncMock()
    monkeypatch.setattr(models.Source, "_release_deletion_claim", release)
    record_delete = AsyncMock()
    monkeypatch.setattr(ObjectModel, "delete", record_delete)

    with pytest.raises(ExternalServiceError, match="was not deleted"):
        await source.delete()

    release.assert_awaited_once()
    record_delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_readyz_rechecks_schema_embedding_contract_search_and_r2(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from open_notebook.rag import runtime

    state = runtime.RagRuntimeState(
        schema_version=1,
        embedding_model_id="embedding-v1",
        embedding_model="embedding-v1",
        embedding_base_url="https://embedding.example/v1",
        embedding_dimensions=2,
        embedding_probe_succeeded=True,
        r2_probe_succeeded=True,
    )
    async def query(statement: str, variables=None):
        if "rag_schema" in statement:
            return [{"version": 1}]
        return [
            {
                "model": "embedding-v1",
                "base_url": "https://embedding.example/v1",
                "dimensions": 2,
            }
        ]

    monkeypatch.setattr(runtime, "repo_query", query)
    monkeypatch.setenv("OPENAI_API_KEY", "secret")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://embedding.example/v1")
    monkeypatch.setenv("OPENAI_EMBEDDING_MODEL", "embedding-v1")
    search_probe = AsyncMock()
    r2_probe = AsyncMock()
    monkeypatch.setattr(runtime, "probe_search_contract", search_probe)
    monkeypatch.setattr(runtime, "probe_r2_access", r2_probe)

    first = await runtime.readiness_details(state)
    second = await runtime.readiness_details(state)

    assert first["status"] == second["status"] == "ready"
    assert search_probe.await_count == 2
    assert r2_probe.await_count == 2


def test_r2_prefix_cannot_overlap_the_knowledge_source_prefix(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from open_notebook.exceptions import ConfigurationError
    from open_notebook.rag import runtime

    for prefix in ("knowledge-sources", "knowledge-sources/open-notebook"):
        store = SimpleNamespace(
            enabled=True,
            bucket="knowledge",
            prefix=prefix,
            client=MagicMock(),
        )
        monkeypatch.setattr(runtime, "get_artifact_store", lambda: store)
        with pytest.raises(ConfigurationError, match="must not overlap"):
            runtime.validate_r2_configuration()


def test_rag_image_target_and_supervisor_contract() -> None:
    root = Path(__file__).parent.parent
    dockerfile = (root / "Dockerfile").read_text(encoding="utf-8")
    supervisor = (root / "supervisord.rag.conf").read_text(encoding="utf-8")
    assert "AS lingxiloop-rag" in dockerfile
    assert "api.rag_main:app" in supervisor
    assert "--import-modules rag_commands" in supervisor
    assert "command=/app/.venv/bin/uvicorn" in supervisor
    assert "command=/app/.venv/bin/surreal-commands-worker" in supervisor
    assert "uv run" not in supervisor
    assert "[program:rag-api]" in supervisor
    assert "[program:rag-worker]" in supervisor
    assert supervisor.count("[program:") == 2
    rag_target = dockerfile.split("FROM python:3.12-slim-trixie AS lingxiloop-rag", 1)[
        1
    ].split("FROM runtime-base AS runtime", 1)[0]
    assert "node" not in rag_target.lower()
    assert "frontend" not in rag_target.lower()
    assert "scripts/docker-entrypoint.sh" not in rag_target
    assert "ghcr.io/astral-sh/uv" not in rag_target
    assert "8502" not in rag_target
