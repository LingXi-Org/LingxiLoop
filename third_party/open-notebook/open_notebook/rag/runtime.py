"""Startup bootstrap and readiness checks for the production RAG profile."""

import asyncio
import uuid
from dataclasses import dataclass
from pathlib import Path

from open_notebook.artifact_storage import get_artifact_store
from open_notebook.database.repository import repo_query, repo_query_statements
from open_notebook.exceptions import ConfigurationError
from open_notebook.rag.embedding import (
    embedding_configuration,
)
from open_notebook.utils.url_validation import validate_url

DATABASE_STARTUP_RETRY_ATTEMPTS = 12
DATABASE_STARTUP_RETRY_INITIAL_DELAY_SECONDS = 1
DATABASE_STARTUP_RETRY_MAX_DELAY_SECONDS = 5
DATABASE_STARTUP_RETRY_PROBE_TIMEOUT_SECONDS = 5
EMBEDDING_DIMENSIONS = 1536


@dataclass(frozen=True)
class RagRuntimeState:
    schema_version: int
    embedding_model_id: str
    embedding_model: str
    embedding_base_url: str
    embedding_dimensions: int
    embedding_probe_succeeded: bool
    r2_probe_succeeded: bool


async def _wait_for_database() -> None:
    delay = DATABASE_STARTUP_RETRY_INITIAL_DELAY_SECONDS
    for attempt in range(1, DATABASE_STARTUP_RETRY_ATTEMPTS + 1):
        try:
            await asyncio.wait_for(
                repo_query("RETURN true;"),
                timeout=DATABASE_STARTUP_RETRY_PROBE_TIMEOUT_SECONDS,
            )
            return
        except Exception:
            if attempt == DATABASE_STARTUP_RETRY_ATTEMPTS:
                raise
            await asyncio.sleep(delay)
            delay = min(delay * 2, DATABASE_STARTUP_RETRY_MAX_DELAY_SECONDS)


async def initialize_rag_schema() -> int:
    await _wait_for_database()
    marker = await repo_query("SELECT version FROM open_notebook:rag_schema;")
    if marker:
        version = int(marker[0].get("version") or 0)
        if version != 1:
            raise ConfigurationError("RAG schema version mismatch; reset the knowledge plane")
        return version
    for table in ("source", "notebook", "source_embedding"):
        rows = await repo_query(f"SELECT count() AS count FROM {table} GROUP ALL;")
        if rows and int(rows[0].get("count") or 0) > 0:
            raise ConfigurationError("Non-RAG database detected; reset the knowledge plane")
    schema = Path(__file__).with_name("schema.surrealql").read_text(encoding="utf-8")
    await repo_query_statements(schema)
    return 1


async def bootstrap_embedding_model() -> tuple[str, str, str]:
    _, base_url, configured_name = embedding_configuration()
    try:
        await validate_url(base_url, "openai_compatible")
    except ValueError as exc:
        raise ConfigurationError(str(exc)) from exc

    normalized_base_url = base_url.rstrip("/")
    contract_rows = await repo_query(
        "SELECT * FROM open_notebook:rag_embedding_contract;"
    )
    contract = contract_rows[0] if contract_rows else {}
    if contract and (
        contract.get("model") != configured_name
        or contract.get("base_url") != normalized_base_url
    ):
        raise ConfigurationError(
            "Stored embedding endpoint/model contract changed; reset the knowledge plane"
        )
    if not contract:
        existing_chunks = await repo_query(
            "SELECT count() AS count FROM source_embedding GROUP ALL;"
        )
        if existing_chunks and int(existing_chunks[0].get("count", 0)) > 0:
            raise ConfigurationError(
                "Existing embeddings predate the RAG embedding contract; "
                "reset the knowledge plane"
            )

    return configured_name, configured_name, normalized_base_url


def validate_r2_configuration() -> None:
    store = get_artifact_store()
    if not store.enabled or not store.bucket or store.client is None:
        raise ConfigurationError(
            "The production RAG profile requires a complete R2 configuration"
        )
    open_notebook_prefix = f"{store.prefix.strip('/')}/"
    knowledge_prefix = "knowledge-sources/"
    if open_notebook_prefix.startswith(knowledge_prefix) or knowledge_prefix.startswith(
        open_notebook_prefix
    ):
        raise ConfigurationError(
            "OPEN_NOTEBOOK_R2_PREFIX must not overlap knowledge-sources/"
        )


async def probe_r2_access() -> None:
    validate_r2_configuration()
    store = get_artifact_store()

    payload = b"lingxiloop-rag-readiness"
    prefix = store.prefix.strip("/")
    key = "/".join(
        part for part in (prefix, "readiness", f"{uuid.uuid4().hex}.txt") if part
    )

    def probe() -> None:
        wrote = False
        body = None
        try:
            store.client.put_object(Bucket=store.bucket, Key=key, Body=payload)
            wrote = True
            response = store.client.get_object(Bucket=store.bucket, Key=key)
            body = response.get("Body") if isinstance(response, dict) else None
            if body is None or body.read() != payload:
                raise RuntimeError("R2 readiness object did not round-trip")
        finally:
            try:
                if body is not None:
                    body.close()
            finally:
                if wrote:
                    store.client.delete_object(Bucket=store.bucket, Key=key)

    try:
        await asyncio.to_thread(probe)
    except Exception as exc:
        raise ConfigurationError(
            "R2 bucket/prefix read-write-delete readiness probe failed"
        ) from exc


async def probe_search_contract(embedding: list[float]) -> None:
    """Exercise both RAG functions with an empty source allowlist."""

    probes = (
        (
            "SELECT * FROM fn::scoped_text_search($query, 1, $source_ids);",
            {"query": "lingxiloop", "source_ids": []},
        ),
        (
            "SELECT * FROM fn::scoped_vector_search($embedding, 1, 0.0, $source_ids);",
            {"embedding": embedding, "source_ids": []},
        ),
    )
    for statement, variables in probes:
        rows = await repo_query(statement, variables)
        if not isinstance(rows, list):
            raise ConfigurationError("RAG search function returned an invalid result")


async def persist_embedding_contract(
    *, model_id: str, model: str, base_url: str, dimensions: int
) -> None:
    rows = await repo_query("SELECT * FROM open_notebook:rag_embedding_contract;")
    existing = rows[0] if rows else {}
    if existing and int(existing.get("dimensions") or 0) != dimensions:
        raise ConfigurationError(
            "Embedding vector dimensions changed; reset the knowledge plane"
        )
    if existing and str(existing.get("model_id") or "") != model_id:
        raise ConfigurationError(
            "Stored embedding model ID changed; reset the knowledge plane"
        )
    variables = {
        "model_id": model_id,
        "model": model,
        "base_url": base_url,
        "dimensions": dimensions,
    }
    if existing:
        await repo_query(
            """
            UPDATE open_notebook:rag_embedding_contract SET
                model_id = $model_id,
                model = $model,
                base_url = $base_url,
                dimensions = $dimensions,
                updated = time::now();
            """,
            variables,
        )
    else:
        await repo_query(
            """
            CREATE open_notebook:rag_embedding_contract SET
                model_id = $model_id,
                model = $model,
                base_url = $base_url,
                dimensions = $dimensions,
                created = time::now(),
                updated = time::now();
            """,
            variables,
        )


async def initialize_runtime() -> RagRuntimeState:
    schema_version = await initialize_rag_schema()
    model_id, model, base_url = await bootstrap_embedding_model()
    await probe_r2_access()
    await persist_embedding_contract(
        model_id=model_id,
        model=model,
        base_url=base_url,
        dimensions=EMBEDDING_DIMENSIONS,
    )
    await probe_search_contract([0.0] * EMBEDDING_DIMENSIONS)
    return RagRuntimeState(
        schema_version=schema_version,
        embedding_model_id=model_id,
        embedding_model=model,
        embedding_base_url=base_url,
        embedding_dimensions=EMBEDDING_DIMENSIONS,
        embedding_probe_succeeded=True,
        r2_probe_succeeded=True,
    )


async def readiness_details(state: RagRuntimeState) -> dict[str, object]:
    marker = await repo_query("SELECT version FROM open_notebook:rag_schema;")
    version = int(marker[0].get("version") or 0) if marker else 0
    if version != state.schema_version:
        raise ConfigurationError(
            f"RAG schema changed after startup: {state.schema_version} -> {version}"
        )
    _, configured_base_url, configured_model = embedding_configuration()
    if (
        configured_model != state.embedding_model
        or configured_base_url.rstrip("/") != state.embedding_base_url
    ):
        raise ConfigurationError("RAG embedding environment changed after startup")
    contract_rows = await repo_query(
        "SELECT * FROM open_notebook:rag_embedding_contract;"
    )
    contract = contract_rows[0] if contract_rows else {}
    if (
        contract.get("model") != state.embedding_model
        or contract.get("base_url") != state.embedding_base_url
        or int(contract.get("dimensions") or 0) != state.embedding_dimensions
    ):
        raise ConfigurationError("RAG embedding contract changed after startup")
    await probe_search_contract([0.0] * state.embedding_dimensions)
    await probe_r2_access()
    return {
        "status": "ready",
        "profile": "rag",
        "schema_version": state.schema_version,
        "embedding_model_id": state.embedding_model_id,
        "embedding_dimensions": state.embedding_dimensions,
        "embedding_probe": True,
        "r2_probe": True,
    }
