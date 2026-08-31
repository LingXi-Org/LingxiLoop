"""Extraction, chunking, and atomic vector replacement for RAG sources."""

import asyncio
from typing import Any

from loguru import logger

from open_notebook.artifact_storage import get_artifact_store
from open_notebook.config import UPLOADS_FOLDER
from open_notebook.database.repository import (
    ensure_record_id,
    repo_query,
    repo_query_statements,
)
from open_notebook.rag.chunking import chunk_text
from open_notebook.rag.contract import validate_embedding_vectors
from open_notebook.rag.embedding import generate_embeddings
from open_notebook.rag.extraction import MAX_SOURCE_BYTES, extract_content
from open_notebook.rag.models import Source


async def extract_source(source: Source, content_state: dict[str, Any]) -> Source:
    file_reference = content_state.get("file_path")
    materialized = None
    extraction_path = file_reference
    if file_reference and get_artifact_store().is_object_reference(file_reference):
        materialized = await asyncio.to_thread(
            get_artifact_store().materialize,
            file_reference,
            "sources",
            UPLOADS_FOLDER,
            MAX_SOURCE_BYTES,
        )
        extraction_path = str(materialized.path)

    try:
        result = await extract_content(
            url=content_state.get("url"),
            file_path=extraction_path,
            content=content_state.get("content"),
        )
    finally:
        if materialized:
            materialized.release()

    if not result.content or not result.content.strip():
        raise ValueError("Source extraction produced no text")

    source.full_text = result.content
    if result.title and (not source.title or source.title == "Processing..."):
        source.title = result.title
    await source.save()
    return source


async def replace_source_embeddings(source: Source) -> int:
    if not source.id or not source.full_text or not source.full_text.strip():
        raise ValueError("Source has no text to embed")

    chunks = chunk_text(source.full_text)
    if not chunks:
        raise ValueError("Source chunking produced no chunks")

    embeddings = await generate_embeddings(chunks, source.company_id)
    if len(embeddings) != len(chunks):
        raise RuntimeError(
            f"Embedding count mismatch: {len(embeddings)} for {len(chunks)} chunks"
        )
    await validate_embedding_vectors(embeddings)

    source_id = ensure_record_id(source.id)
    records = [
        {
            "source": source_id,
            "order": order,
            "content": chunk,
            "embedding": embedding,
        }
        for order, (chunk, embedding) in enumerate(zip(chunks, embeddings))
    ]
    await repo_query_statements(
        """
        BEGIN TRANSACTION;
        DELETE source_embedding WHERE source = $source_id;
        FOR $record IN $records {
            CREATE source_embedding CONTENT $record;
        };
        COMMIT TRANSACTION;
        """,
        {"source_id": source_id, "records": records},
    )

    count_rows = await repo_query(
        "SELECT count() AS chunks FROM source_embedding "
        "WHERE source = $source_id GROUP ALL;",
        {"source_id": source_id},
    )
    stored = int(count_rows[0]["chunks"]) if count_rows else 0
    if stored != len(chunks) or stored == 0:
        raise RuntimeError(
            f"Stored chunk count mismatch: expected {len(chunks)}, found {stored}"
        )
    logger.info(f"Embedded source {source.id} into {stored} chunks")
    return stored


async def process_source(
    source_id: str, content_state: dict[str, Any]
) -> tuple[Source, int]:
    source = await Source.get(source_id)
    if source.rag_state == "deleting":
        raise ValueError(f"Source {source_id!r} is being deleted")
    source = await extract_source(source, content_state)
    embedded_chunks = await replace_source_embeddings(source)
    return source, embedded_chunks
