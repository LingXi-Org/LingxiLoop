"""Exact production API surface for document ingestion and scoped retrieval."""

import asyncio
import base64
import hashlib
import json
import re
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from loguru import logger

from api.rag_models import (
    AssetResponse,
    NotebookCreate,
    NotebookResponse,
    NotebookUpdate,
    PresentationMaterialAsset,
    PresentationMaterialBlock,
    PresentationMaterialResponse,
    SearchRequest,
    SearchResponse,
    SearchResult,
    SourceJsonCreate,
    SourceResponse,
    SourceStatusResponse,
)
from open_notebook.artifact_storage import get_artifact_store
from open_notebook.config import UPLOADS_FOLDER
from open_notebook.database.repository import (
    ensure_record_id,
    repo_query,
    repo_query_statements,
)
from open_notebook.exceptions import InvalidInputError, NotFoundError
from open_notebook.rag.contract import validate_embedding_vectors
from open_notebook.rag.embedding import generate_query_embedding
from open_notebook.rag.extraction import (
    MAX_SOURCE_BYTES,
    prepare_public_http_target,
)
from open_notebook.rag.models import Asset, Notebook, Source, exact_record_id
from rag_commands import SourceProcessingInput

router = APIRouter()

ALLOWED_UPLOAD_MIME_BY_SUFFIX = {
    ".pdf": "application/pdf",
    ".docx": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ),
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
}
IDEMPOTENCY_KEY_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$")
MAX_PRESENTATION_BLOCKS = 400
MAX_PRESENTATION_BLOCK_BYTES = 4_000
MAX_PRESENTATION_TEXT_BYTES = 512_000
MAX_PRESENTATION_ASSETS = 24
MAX_PRESENTATION_ASSET_BYTES = 1536 * 1024
MAX_PRESENTATION_ASSET_TOTAL_BYTES = 10 * 1024 * 1024
_PAGE_MARKER = re.compile(
    r"(?:\[\[PAGE\s*:\s*(\d+)\]\]|(?:^|\n)\s*(?:page|页)\s*(\d+)\s*(?:$|\n))",
    re.IGNORECASE,
)
_SECTION_MARKER = re.compile(r"(?:^|\n)\s{0,3}#{1,6}\s+([^\n#]{1,200})")
_PRESENTATION_IMAGE_MIMES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


def _asset_response(source: Source) -> AssetResponse | None:
    if not source.asset:
        return None
    return AssetResponse(
        file_path=source.asset.file_path,
        url=source.asset.url,
    )


async def _source_response(
    source: Source,
    *,
    status_override: str | None = None,
    processing_override: dict[str, Any] | None = None,
) -> SourceResponse:
    embedded_chunks = await source.get_embedded_chunks()
    status = status_override
    processing_info = processing_override
    if status is None:
        status = await source.get_status()
        processing_info = await source.get_processing_progress()
    if status == "completed" and embedded_chunks <= 0:
        status = "failed"
        processing_info = {"error": "Processing completed without searchable chunks"}
    notebooks = await repo_query(
        "SELECT VALUE out FROM reference WHERE in = $source_id;",
        {"source_id": ensure_record_id(source.id or "")},
    )
    return SourceResponse(
        id=source.id or "",
        title=source.title,
        topics=source.topics or [],
        asset=_asset_response(source),
        full_text=source.full_text,
        embedded=embedded_chunks > 0,
        embedded_chunks=embedded_chunks,
        created=str(source.created),
        updated=str(source.updated),
        command_id=str(source.command) if source.command else None,
        status=status,
        processing_info=processing_info,
        notebooks=[str(value) for value in notebooks],
    )


def _notebook_response(notebook: Notebook, source_count: int = 0) -> NotebookResponse:
    return NotebookResponse(
        id=notebook.id or "",
        name=notebook.name,
        description=notebook.description,
        archived=bool(notebook.archived),
        created=str(notebook.created),
        updated=str(notebook.updated),
        source_count=source_count,
        external_key=notebook.external_key,
    )


def _idempotency_key(request: Request) -> str:
    value = request.headers.get("Idempotency-Key", "").strip()
    if not IDEMPOTENCY_KEY_PATTERN.fullmatch(value):
        raise HTTPException(
            status_code=422,
            detail="A valid Idempotency-Key header is required",
        )
    return value


def _ingestion_fingerprint(
    *,
    source_type: str,
    notebook_ids: list[str],
    title: str | None,
    content_identity: dict[str, Any],
) -> str:
    canonical = json.dumps(
        {
            "version": 1,
            "type": source_type,
            "notebooks": sorted(notebook_ids),
            "title": title,
            "content": content_identity,
        },
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


async def _find_idempotent_source(external_key: str) -> Source | None:
    rows = await repo_query(
        "SELECT * FROM source WHERE external_key = $external_key LIMIT 1;",
        {"external_key": external_key},
    )
    return Source(**rows[0]) if rows else None


def _validate_idempotent_replay(source: Source, fingerprint: str) -> None:
    if source.ingestion_fingerprint != fingerprint:
        raise HTTPException(
            status_code=409,
            detail="Idempotency-Key was already used for a different source request",
        )
    if not source.command:
        raise HTTPException(
            status_code=409,
            detail="Idempotent source creation is incomplete",
        )


async def _discard_unclaimed_asset(
    asset: Asset | None, existing: Source | None
) -> None:
    reference = asset.file_path if asset and asset.owned else None
    existing_reference = (
        existing.asset.file_path if existing and existing.asset else None
    )
    if reference and reference != existing_reference:
        await asyncio.to_thread(
            get_artifact_store().delete,
            reference,
            "sources",
            UPLOADS_FOLDER,
        )


async def _idempotent_replay(
    external_key: str, fingerprint: str
) -> SourceResponse | None:
    source = await _find_idempotent_source(external_key)
    if source is None:
        return None
    _validate_idempotent_replay(source, fingerprint)
    return await _source_response(source)


async def _verify_notebooks(notebook_ids: list[str]) -> None:
    if len(set(notebook_ids)) != len(notebook_ids):
        raise HTTPException(status_code=422, detail="notebooks must be unique")
    for notebook_id in notebook_ids:
        try:
            await Notebook.get(notebook_id)
        except NotFoundError as exc:
            raise HTTPException(
                status_code=404, detail=f"Notebook {notebook_id} not found"
            ) from exc


async def _enqueue_process_source(
    *,
    source_id: str,
    content_state: dict[str, Any],
    notebook_ids: list[str],
    expected_command_id: str | None = None,
) -> str:
    source_record = exact_record_id(source_id, "source")
    command_input = SourceProcessingInput(
        source_id=source_id,
        content_state=content_state,
        notebook_ids=notebook_ids,
    )
    variables: dict[str, Any] = {
        "source_id": source_record,
        "args": command_input.model_dump(mode="json", exclude_none=True),
    }
    if expected_command_id is None:
        claim = "command = NONE AND rag_state = NONE"
    else:
        variables["expected_command_id"] = exact_record_id(
            expected_command_id, "command"
        )
        claim = (
            "command = $expected_command_id AND command.status = 'failed' "
            "AND rag_state = NONE"
        )
    statement_results = await repo_query_statements(
        f"""
        BEGIN TRANSACTION;
        LET $new_command = CREATE ONLY command SET
            app = 'open_notebook',
            name = 'process_source',
            args = $args,
            context = {{}},
            status = 'new';
        LET $linked_source = UPDATE $source_id
            SET command = $new_command.id
            WHERE {claim}
            RETURN AFTER;
        IF array::len($linked_source) = 0 {{
            THROW 'RAG_SOURCE_COMMAND_STATE_CHANGED';
        }};
        COMMIT TRANSACTION;
        RETURN {{ command_id: $new_command.id }};
        """,
        variables,
    )
    for result in reversed(statement_results):
        rows = result if isinstance(result, list) else [result]
        for row in rows:
            command_id = row.get("command_id") if isinstance(row, dict) else None
            if command_id:
                return str(command_id)
    raise RuntimeError("Command transaction returned no command ID")


async def _queue_source(
    *,
    notebook_ids: list[str],
    title: str | None,
    content_state: dict[str, Any],
    asset: Asset | None,
    external_key: str,
    ingestion_fingerprint: str,
    initial_text: str | None = None,
    company_id: str,
) -> SourceResponse:
    await _verify_notebooks(notebook_ids)
    existing = await _find_idempotent_source(external_key)
    if existing is not None:
        await _discard_unclaimed_asset(asset, existing)
        _validate_idempotent_replay(existing, ingestion_fingerprint)
        return await _source_response(existing)

    source = Source(
        title=title or "Processing...",
        topics=[],
        asset=asset,
        full_text=initial_text,
        external_key=external_key,
        ingestion_fingerprint=ingestion_fingerprint,
        company_id=company_id,
    )
    pending_source_id = f"source:{uuid.uuid4().hex}"
    command_input = SourceProcessingInput(
        source_id=pending_source_id,
        content_state=content_state,
        notebook_ids=notebook_ids,
    )
    source_data = source.model_dump(
        mode="json",
        exclude={"id", "created", "updated", "command", "rag_state"},
        exclude_none=True,
    )
    created_at = datetime.now(timezone.utc)
    source_data["created"] = created_at
    source_data["updated"] = created_at
    try:
        statement_results = await repo_query_statements(
            """
            BEGIN TRANSACTION;
            LET $new_source = CREATE ONLY $source_id CONTENT $source_data;
            FOR $notebook_id IN $notebook_ids {
                RELATE $source_id->reference->$notebook_id;
            };
            LET $new_command = CREATE ONLY command SET
                app = 'open_notebook',
                name = 'process_source',
                args = $command_args,
                context = {},
                status = 'new';
            UPDATE $source_id SET command = $new_command.id;
            COMMIT TRANSACTION;
            RETURN { source_id: $source_id, command_id: $new_command.id };
            """,
            {
                "source_id": exact_record_id(pending_source_id, "source"),
                "source_data": source_data,
                "notebook_ids": [
                    exact_record_id(value, "notebook") for value in notebook_ids
                ],
                "command_args": command_input.model_dump(
                    mode="json", exclude_none=True
                ),
            },
        )
        source_id = ""
        command_id = ""
        for result in reversed(statement_results):
            rows = result if isinstance(result, list) else [result]
            for row in rows:
                if isinstance(row, dict) and row.get("source_id"):
                    source_id = str(row["source_id"])
                    command_id = str(row.get("command_id") or "")
                    break
            if source_id:
                break
        if not source_id or not command_id:
            raise RuntimeError("Source transaction returned no source or command ID")
        source = await Source.get(source_id)
    except Exception:
        replay = await _find_idempotent_source(external_key)
        if replay is not None:
            await _discard_unclaimed_asset(asset, replay)
            _validate_idempotent_replay(replay, ingestion_fingerprint)
            return await _source_response(replay)
        await _discard_unclaimed_asset(asset, None)
        raise
    source.command = exact_record_id(command_id, "command")
    return await _source_response(
        source,
        status_override="queued",
        processing_override={"queued": True},
    )


@router.post("/notebooks", response_model=NotebookResponse)
async def create_notebook(payload: NotebookCreate) -> NotebookResponse:
    existing = await repo_query(
        "SELECT * FROM notebook WHERE external_key = $external_key LIMIT 1;",
        {"external_key": payload.external_key},
    )
    if existing:
        notebook = Notebook(**existing[0])
        count = await repo_query(
            "SELECT count() AS count FROM reference "
            "WHERE out = $notebook_id GROUP ALL;",
            {"notebook_id": ensure_record_id(notebook.id or "")},
        )
        return _notebook_response(notebook, int(count[0]["count"]) if count else 0)
    notebook = Notebook(
        name=payload.name,
        description=payload.description,
        external_key=payload.external_key,
    )
    await notebook.save()
    return _notebook_response(notebook)


@router.put("/notebooks/{notebook_id}", response_model=NotebookResponse)
async def update_notebook(
    notebook_id: str, payload: NotebookUpdate
) -> NotebookResponse:
    try:
        notebook = await Notebook.get(notebook_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail="Notebook not found") from exc
    if payload.name is not None:
        notebook.name = payload.name
    if payload.description is not None:
        notebook.description = payload.description
    if payload.archived is not None:
        notebook.archived = payload.archived
    await notebook.save()
    count = await repo_query(
        "SELECT count() AS count FROM reference WHERE out = $notebook_id GROUP ALL;",
        {"notebook_id": ensure_record_id(notebook_id)},
    )
    return _notebook_response(notebook, int(count[0]["count"]) if count else 0)


@router.post("/sources/json", response_model=SourceResponse)
async def create_json_source(
    payload: SourceJsonCreate, request: Request
) -> SourceResponse:
    external_key = _idempotency_key(request)
    if payload.type == "file":
        assert payload.storage_key is not None
        assert payload.filename is not None
        assert payload.mime_type is not None
        assert payload.size_bytes is not None
        key = payload.storage_key.strip("/")
        if not key.startswith("knowledge-sources/") or ".." in Path(key).parts:
            raise HTTPException(status_code=422, detail="Invalid knowledge storage key")
        _validate_upload_media_type(payload.filename, payload.mime_type)
        reference = f"r2://{key}"
        store = get_artifact_store()
        try:
            metadata = await asyncio.to_thread(
                store.client.head_object, Bucket=store.bucket, Key=key
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Knowledge object not found") from exc
        if int(metadata.get("ContentLength", -1)) != payload.size_bytes:
            raise HTTPException(status_code=409, detail="Knowledge object size changed")
        stored_type = str(metadata.get("ContentType", "")).partition(";")[0].lower()
        if stored_type != payload.mime_type.partition(";")[0].strip().lower():
            raise HTTPException(status_code=409, detail="Knowledge object type changed")
        fingerprint = _ingestion_fingerprint(
            source_type="file",
            notebook_ids=payload.notebooks,
            title=payload.title,
            content_identity={"key": key, "bytes": payload.size_bytes},
        )
        replay = await _idempotent_replay(external_key, fingerprint)
        if replay is not None:
            return replay
        return await _queue_source(
            notebook_ids=payload.notebooks,
            title=payload.title or payload.filename,
            content_state={"file_path": reference},
            asset=Asset(file_path=reference, owned=False),
            external_key=external_key,
            ingestion_fingerprint=fingerprint,
            company_id=payload.company_id,
        )
    if payload.type == "link":
        assert payload.url is not None
        fingerprint = _ingestion_fingerprint(
            source_type="link",
            notebook_ids=payload.notebooks,
            title=payload.title,
            content_identity={"url": payload.url},
        )
        replay = await _idempotent_replay(external_key, fingerprint)
        if replay is not None:
            return replay
        try:
            await prepare_public_http_target(payload.url)
        except InvalidInputError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return await _queue_source(
            notebook_ids=payload.notebooks,
            title=payload.title,
            content_state={"url": payload.url},
            asset=Asset(url=payload.url),
            external_key=external_key,
            ingestion_fingerprint=fingerprint,
            company_id=payload.company_id,
        )
    assert payload.content is not None
    encoded_content = payload.content.encode("utf-8")
    if len(encoded_content) > MAX_SOURCE_BYTES:
        raise HTTPException(status_code=413, detail="Text exceeds the 200 MiB limit")
    fingerprint = _ingestion_fingerprint(
        source_type="text",
        notebook_ids=payload.notebooks,
        title=payload.title,
        content_identity={
            "sha256": hashlib.sha256(encoded_content).hexdigest(),
            "bytes": len(encoded_content),
        },
    )
    replay = await _idempotent_replay(external_key, fingerprint)
    if replay is not None:
        return replay
    return await _queue_source(
        notebook_ids=payload.notebooks,
        title=payload.title,
        content_state={"content": payload.content},
        asset=None,
        external_key=external_key,
        ingestion_fingerprint=fingerprint,
        initial_text=payload.content,
        company_id=payload.company_id,
    )


def _validate_upload_media_type(filename: str, content_type: str | None) -> None:
    suffix = Path(filename).suffix.lower()
    media_type = (content_type or "").partition(";")[0].strip().lower()
    if (
        suffix not in ALLOWED_UPLOAD_MIME_BY_SUFFIX
        or media_type != ALLOWED_UPLOAD_MIME_BY_SUFFIX[suffix]
    ):
        raise HTTPException(
            status_code=415,
            detail="Upload filename extension and Content-Type do not match",
        )


@router.get("/sources/{source_id}", response_model=SourceResponse)
async def get_source(source_id: str) -> SourceResponse:
    try:
        source = await Source.get(source_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail="Source not found") from exc
    return await _source_response(source)


@router.get("/sources/{source_id}/status", response_model=SourceStatusResponse)
async def get_source_status(source_id: str) -> SourceStatusResponse:
    try:
        source = await Source.get(source_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail="Source not found") from exc
    embedded_chunks = await source.get_embedded_chunks()
    status = await source.get_status()
    processing_info = await source.get_processing_progress()
    if status == "completed" and embedded_chunks <= 0:
        status = "failed"
        processing_info = {"error": "Processing completed without searchable chunks"}
    messages = {
        "new": "Source processing queued",
        "queued": "Source processing queued",
        "running": "Source processing in progress",
        "completed": "Source processing and embedding completed",
        "failed": "Source processing failed",
        "canceled": "Source processing canceled",
    }
    return SourceStatusResponse(
        status=status,
        message=messages[status],
        processing_info=processing_info,
        command_id=str(source.command) if source.command else None,
        embedded_chunks=embedded_chunks,
    )


def _presentation_location(
    text: str, current_page: int | None, current_section: str | None
) -> tuple[str, int | None, str | None]:
    page_match = _PAGE_MARKER.search(text)
    if page_match:
        current_page = int(page_match.group(1) or page_match.group(2))
    section_match = _SECTION_MARKER.search(text)
    if section_match:
        current_section = " ".join(section_match.group(1).split())[:200]
    clean = _PAGE_MARKER.sub("\n", text)
    return clean.strip(), current_page, current_section


def _presentation_asset(
    data: bytes,
    *,
    name: str,
    page_number: int | None,
    width: int | None = None,
    height: int | None = None,
) -> PresentationMaterialAsset | None:
    suffix = Path(name).suffix.lower()
    mime_type = _PRESENTATION_IMAGE_MIMES.get(suffix)
    if not mime_type or not data or len(data) > MAX_PRESENTATION_ASSET_BYTES:
        return None
    digest = hashlib.sha256(data).hexdigest()
    return PresentationMaterialAsset(
        asset_id=f"presentation_asset:{digest[:24]}",
        mime_type=mime_type,
        data_uri=f"data:{mime_type};base64,{base64.b64encode(data).decode('ascii')}",
        page_number=page_number,
        section_title=None,
        width=width if width and width > 0 else None,
        height=height if height and height > 0 else None,
    )


def _extract_presentation_assets_from_file(
    path: Path,
) -> list[PresentationMaterialAsset]:
    assets: list[PresentationMaterialAsset] = []
    seen: set[str] = set()
    total_bytes = 0

    def append(asset: PresentationMaterialAsset | None) -> bool:
        nonlocal total_bytes
        if asset is None or asset.asset_id in seen:
            return True
        encoded_size = len(asset.data_uri.encode("ascii"))
        if total_bytes + encoded_size > MAX_PRESENTATION_ASSET_TOTAL_BYTES:
            return False
        seen.add(asset.asset_id)
        assets.append(asset)
        total_bytes += encoded_size
        return len(assets) < MAX_PRESENTATION_ASSETS

    if path.suffix.lower() == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(path)
        for page_number, page in enumerate(reader.pages[:100], start=1):
            for image in page.images:
                pil_image = getattr(image, "image", None)
                size = getattr(pil_image, "size", (None, None))
                if not append(
                    _presentation_asset(
                        image.data,
                        name=image.name,
                        page_number=page_number,
                        width=size[0],
                        height=size[1],
                    )
                ):
                    return assets
    elif path.suffix.lower() == ".docx":
        with zipfile.ZipFile(path) as archive:
            for entry in sorted(archive.infolist(), key=lambda item: item.filename):
                if not entry.filename.startswith("word/media/"):
                    continue
                if (
                    entry.file_size <= 0
                    or entry.file_size > MAX_PRESENTATION_ASSET_BYTES
                ):
                    continue
                if not append(
                    _presentation_asset(
                        archive.read(entry), name=entry.filename, page_number=None
                    )
                ):
                    return assets
    return assets


async def _presentation_assets(source: Source) -> list[PresentationMaterialAsset]:
    reference = source.asset.file_path if source.asset else None
    if not reference:
        return []
    store = get_artifact_store()
    try:
        materialized = await asyncio.to_thread(
            store.materialize, reference, "sources", UPLOADS_FOLDER
        )
    except (FileNotFoundError, ValueError):
        return []
    try:
        if materialized.path.suffix.lower() not in {".pdf", ".docx"}:
            return []
        try:
            return await asyncio.to_thread(
                _extract_presentation_assets_from_file, materialized.path
            )
        except Exception as exc:
            logger.warning(
                "Presentation image extraction unavailable for source {}: {}",
                source.id,
                type(exc).__name__,
            )
            return []
    finally:
        materialized.release()


@router.get(
    "/sources/{source_id}/presentation-material",
    response_model=PresentationMaterialResponse,
)
async def get_presentation_material(source_id: str) -> PresentationMaterialResponse:
    """Return bounded, citation-ready material for an already embedded Source.

    The production RAG profile persists chunk text and ordering. Optional page
    markers emitted by extraction and Markdown headings are retained as
    provenance. Image assets stay empty when the active extractor did not
    persist structured picture regions; callers must never infer them.
    """
    try:
        source = await Source.get(source_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail="Source not found") from exc
    if await source.get_embedded_chunks() <= 0:
        raise HTTPException(
            status_code=409, detail="Source is not ready for presentation material"
        )
    rows = await repo_query(
        "SELECT id, order, content FROM source_embedding "
        "WHERE source = $source_id ORDER BY order ASC LIMIT $limit;",
        {
            "source_id": ensure_record_id(source_id),
            "limit": MAX_PRESENTATION_BLOCKS + 1,
        },
    )
    blocks: list[PresentationMaterialBlock] = []
    total_bytes = 0
    truncated = len(rows) > MAX_PRESENTATION_BLOCKS
    current_page: int | None = None
    current_section: str | None = None
    for fallback_ordinal, row in enumerate(rows[:MAX_PRESENTATION_BLOCKS]):
        raw_text = str(row.get("content") or "").strip()
        if not raw_text:
            continue
        text, current_page, current_section = _presentation_location(
            raw_text, current_page, current_section
        )
        if not text:
            continue
        text = text[:MAX_PRESENTATION_BLOCK_BYTES]
        encoded_bytes = len(text.encode("utf-8"))
        if total_bytes + encoded_bytes > MAX_PRESENTATION_TEXT_BYTES:
            truncated = True
            break
        total_bytes += encoded_bytes
        ordinal_value = row.get("order")
        ordinal = (
            int(ordinal_value)
            if isinstance(ordinal_value, int) and ordinal_value >= 0
            else fallback_ordinal
        )
        blocks.append(
            PresentationMaterialBlock(
                chunk_id=str(row.get("id") or f"source_embedding:{ordinal}"),
                ordinal=ordinal,
                text=text,
                page_number=current_page,
                section_title=current_section,
            )
        )
    assets = await _presentation_assets(source)
    return PresentationMaterialResponse(
        source_id=source_id,
        title=(source.title or "Untitled source")[:500],
        blocks=blocks,
        assets=assets,
        truncated=truncated,
    )


@router.post("/sources/{source_id}/retry", response_model=SourceResponse)
async def retry_source(source_id: str) -> SourceResponse:
    try:
        source = await Source.get(source_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail="Source not found") from exc
    status = await source.get_status() if source.command else None
    if status != "failed":
        raise HTTPException(
            status_code=409, detail="Only failed source processing can be retried"
        )
    notebook_rows = await repo_query(
        "SELECT VALUE out FROM reference WHERE in = $source_id;",
        {"source_id": exact_record_id(source_id, "source")},
    )
    notebook_ids = [str(value) for value in notebook_rows]
    if not notebook_ids:
        raise HTTPException(status_code=400, detail="Source has no notebook scope")
    if source.asset and source.asset.file_path:
        content_state = {"file_path": source.asset.file_path}
    elif source.asset and source.asset.url:
        content_state = {"url": source.asset.url}
    elif source.full_text:
        content_state = {"content": source.full_text}
    else:
        raise HTTPException(status_code=400, detail="Source cannot be retried")
    assert source.command is not None
    try:
        command_id = await _enqueue_process_source(
            source_id=source_id,
            content_state=content_state,
            notebook_ids=notebook_ids,
            expected_command_id=str(source.command),
        )
    except RuntimeError as exc:
        if "RAG_SOURCE_COMMAND_STATE_CHANGED" in str(exc):
            raise HTTPException(
                status_code=409, detail="Source processing state changed"
            ) from exc
        raise
    source.command = exact_record_id(command_id, "command")
    return await _source_response(
        source,
        status_override="queued",
        processing_override={"queued": True, "retry": True},
    )


@router.delete("/sources/{source_id}")
async def delete_source(source_id: str) -> dict[str, str]:
    try:
        source = await Source.get(source_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail="Source not found") from exc
    try:
        await source.delete()
    except InvalidInputError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"message": "Source deleted successfully"}


async def _allowed_source_ids(payload: SearchRequest) -> list[str]:
    try:
        requested = {
            str(exact_record_id(value, "source")) for value in payload.source_ids
        }
        notebook_id = exact_record_id(payload.notebook_id, "notebook")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid RAG scope ID") from exc
    await _verify_notebooks([payload.notebook_id])
    if not requested:
        return []
    rows = await repo_query(
        "SELECT VALUE in FROM reference "
        "WHERE out = $notebook_id AND in IN $source_ids;",
        {
            "notebook_id": notebook_id,
            "source_ids": [exact_record_id(value, "source") for value in requested],
        },
    )
    notebook_sources = {str(value) for value in rows}
    scoped = notebook_sources.intersection(requested)
    if not scoped:
        return []
    embedded_rows = await repo_query(
        "SELECT VALUE source FROM source_embedding WHERE source IN $source_ids;",
        {"source_ids": [exact_record_id(value, "source") for value in scoped]},
    )
    embedded_sources = {str(value) for value in embedded_rows}
    return sorted(scoped.intersection(embedded_sources))


@router.post("/search", response_model=SearchResponse)
async def search(payload: SearchRequest) -> SearchResponse:
    allowed = await _allowed_source_ids(payload)
    if not allowed:
        return SearchResponse(results=[], total_count=0, search_type=payload.type)
    source_ids = [exact_record_id(value, "source") for value in allowed]
    if payload.type == "vector":
        embedding = await generate_query_embedding(payload.query, payload.company_id)
        await validate_embedding_vectors([embedding])
        results = await repo_query(
            "SELECT * FROM fn::scoped_vector_search("
            "$embedding, $limit, $minimum_score, $source_ids);",
            {
                "embedding": embedding,
                "limit": payload.limit,
                "minimum_score": payload.minimum_score,
                "source_ids": source_ids,
            },
        )
    else:
        try:
            results = await repo_query(
                "SELECT * FROM fn::scoped_text_search($query, $limit, $source_ids);",
                {
                    "query": payload.query,
                    "limit": payload.limit,
                    "source_ids": source_ids,
                },
            )
        except RuntimeError as exc:
            if "position overflow" not in str(exc):
                raise
            embedding = await generate_query_embedding(payload.query, payload.company_id)
            await validate_embedding_vectors([embedding])
            results = await repo_query(
                "SELECT * FROM fn::scoped_vector_search("
                "$embedding, $limit, $minimum_score, $source_ids);",
                {
                    "embedding": embedding,
                    "limit": payload.limit,
                    "minimum_score": payload.minimum_score,
                    "source_ids": source_ids,
                },
            )
    normalized_results: list[SearchResult] = []
    for row in results:
        content, page_number, _ = _presentation_location(
            str(row.get("content") or ""), None, None
        )
        if not content:
            continue
        normalized_results.append(
            SearchResult(
                id=str(row.get("id") or ""),
                parent_id=str(row.get("parent_id") or ""),
                title=str(row["title"]) if row.get("title") is not None else None,
                content=content[:8_000],
                matches=[content[:8_000]],
                page_number=page_number,
                similarity=(
                    float(row["similarity"])
                    if isinstance(row.get("similarity"), int | float)
                    else None
                ),
                relevance=(
                    float(row["relevance"])
                    if isinstance(row.get("relevance"), int | float)
                    else None
                ),
            )
        )
    return SearchResponse(
        results=normalized_results,
        total_count=len(normalized_results),
        search_type=payload.type,
    )
