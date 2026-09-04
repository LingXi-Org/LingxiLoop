"""The complete command registry for the production RAG worker."""

import time
from typing import Any

from loguru import logger
from pydantic import ConfigDict
from surreal_commands import CommandInput, CommandOutput, command

from open_notebook.database.repository import ensure_record_id
from open_notebook.exceptions import ConfigurationError, NotFoundError
from open_notebook.rag.ingestion import process_source
from open_notebook.rag.models import Source
from open_notebook.utils.proxy import ensure_internal_no_proxy

ensure_internal_no_proxy()


class SourceProcessingInput(CommandInput):
    model_config = ConfigDict(extra="forbid")

    source_id: str
    content_state: dict[str, Any]
    notebook_ids: list[str]


class SourceProcessingOutput(CommandOutput):
    success: bool
    source_id: str
    embedded_chunks: int
    processing_time: float


@command(
    "process_source",
    app="open_notebook",
    retry={
        "max_attempts": 15,
        "wait_strategy": "exponential_jitter",
        "wait_min": 1,
        "wait_max": 120,
        "stop_on": [ValueError, ConfigurationError],
        "retry_log_level": "debug",
    },
)
async def process_source_command(
    input_data: SourceProcessingInput,
) -> SourceProcessingOutput:
    started = time.time()
    try:
        source = await Source.get(input_data.source_id)
    except NotFoundError as exc:
        raise ValueError(f"Source {input_data.source_id!r} does not exist") from exc
    if source.rag_state == "deleting":
        raise ValueError(f"Source {input_data.source_id!r} is being deleted")

    if input_data.execution_context:
        source.command = ensure_record_id(input_data.execution_context.command_id)
        await source.save()

    processed_source, embedded_chunks = await process_source(
        input_data.source_id, input_data.content_state
    )
    if embedded_chunks <= 0:
        raise RuntimeError("Source processing completed without embedded chunks")
    elapsed = time.time() - started
    logger.info(
        f"RAG source {processed_source.id} completed with "
        f"{embedded_chunks} chunks in {elapsed:.2f}s"
    )
    return SourceProcessingOutput(
        success=True,
        source_id=str(processed_source.id),
        embedded_chunks=embedded_chunks,
        processing_time=elapsed,
    )


__all__ = ["SourceProcessingInput", "SourceProcessingOutput", "process_source_command"]
