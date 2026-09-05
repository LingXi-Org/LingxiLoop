"""Minimal SurrealDB models exposed by the production RAG profile."""

import asyncio
from datetime import datetime
from typing import Any, ClassVar, Self

from loguru import logger
from pydantic import BaseModel, ConfigDict, Field, field_validator
from surrealdb import RecordID

from open_notebook.artifact_storage import get_artifact_store
from open_notebook.config import UPLOADS_FOLDER
from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.domain.base import ObjectModel
from open_notebook.exceptions import (
    DatabaseOperationError,
    ExternalServiceError,
    InvalidInputError,
    NotFoundError,
)

COMMAND_STATUSES = {"new", "running", "completed", "failed", "canceled"}


def exact_record_id(value: str | RecordID, table: str) -> RecordID:
    serialized = str(value)
    if not serialized.startswith(f"{table}:") or serialized == f"{table}:":
        raise InvalidInputError(f"Expected a {table} record ID")
    try:
        return ensure_record_id(value)
    except Exception as exc:
        raise InvalidInputError(f"Invalid {table} record ID") from exc


class ExactObjectModel(ObjectModel):
    @classmethod
    async def get(cls, id: str) -> Self:
        try:
            record_id = exact_record_id(id, cls.table_name)
        except InvalidInputError as exc:
            raise NotFoundError(f"{cls.table_name} not found") from exc
        rows = await repo_query("SELECT * FROM $record_id;", {"record_id": record_id})
        if not rows:
            raise NotFoundError(f"{cls.table_name} not found")
        return cls(**rows[0])


class Notebook(ExactObjectModel):
    table_name: ClassVar[str] = "notebook"
    name: str
    description: str
    archived: bool | None = False
    external_key: str | None = None
    last_viewed_at: datetime | None = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_empty(cls, value: str) -> str:
        if not value.strip():
            raise InvalidInputError("Notebook name cannot be empty")
        return value


class Asset(BaseModel):
    file_path: str | None = None
    url: str | None = None
    owned: bool = True


class Source(ExactObjectModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    table_name: ClassVar[str] = "source"

    asset: Asset | None = None
    title: str | None = None
    topics: list[str] | None = Field(default_factory=list)
    full_text: str | None = None
    last_viewed_at: datetime | None = None
    command: str | RecordID | None = Field(default=None)
    rag_state: str | None = Field(default=None)
    external_key: str | None = Field(default=None)
    ingestion_fingerprint: str | None = Field(default=None)
    company_id: str

    @field_validator("command", mode="before")
    @classmethod
    def parse_command(cls, value: object) -> object:
        if isinstance(value, str) and value:
            return ensure_record_id(value)
        return value

    @field_validator("id", mode="before")
    @classmethod
    def parse_id(cls, value: object) -> str | None:
        return str(value) if value else None

    async def get_status(self) -> str:
        if not self.command:
            raise DatabaseOperationError("Source has no processing command")
        try:
            from surreal_commands import get_command_status

            status = await get_command_status(str(self.command))
            value = getattr(status.status, "value", status.status)
            serialized = str(value)
            if serialized not in COMMAND_STATUSES:
                raise ValueError(f"Unexpected command status {serialized!r}")
            return serialized
        except Exception as exc:
            raise DatabaseOperationError(
                f"Failed to load command status for {self.command}"
            ) from exc

    async def get_processing_progress(self) -> dict[str, Any] | None:
        if not self.command:
            raise DatabaseOperationError("Source has no processing command")
        try:
            from surreal_commands import get_command_status

            status = await get_command_status(str(self.command))
            result = getattr(status, "result", None)
            metadata = (
                result.get("execution_metadata", {}) if isinstance(result, dict) else {}
            )
            return {
                "status": str(getattr(status.status, "value", status.status)),
                "started_at": metadata.get("started_at"),
                "completed_at": metadata.get("completed_at"),
                "error": getattr(status, "error_message", None),
                "result": result,
            }
        except Exception as exc:
            raise DatabaseOperationError(
                f"Failed to load command progress for {self.command}"
            ) from exc

    async def get_embedded_chunks(self) -> int:
        try:
            rows = await repo_query(
                "SELECT count() AS chunks FROM source_embedding "
                "WHERE source = $source_id GROUP ALL;",
                {"source_id": ensure_record_id(self.id or "")},
            )
            return int(rows[0]["chunks"]) if rows else 0
        except Exception as exc:
            raise DatabaseOperationError("Failed to count source chunks") from exc

    async def add_to_notebook(self, notebook_id: str) -> Any:
        if not notebook_id:
            raise InvalidInputError("Notebook ID must be provided")
        exact_record_id(notebook_id, "notebook")
        await Notebook.get(notebook_id)
        return await self.relate("reference", notebook_id)

    def _prepare_save_data(self) -> dict[str, Any]:
        data = super()._prepare_save_data()
        if data.get("command") is not None:
            data["command"] = ensure_record_id(data["command"])
        return data

    async def delete(self) -> bool:
        source_id = exact_record_id(self.id or "", "source")
        claimed = await repo_query(
            "UPDATE $source_id SET rag_state = 'deleting' "
            "WHERE rag_state = NONE AND (command = NONE OR "
            "command.status IN ['completed', 'failed', 'canceled']) RETURN AFTER;",
            {"source_id": source_id},
        )
        if not claimed:
            raise InvalidInputError("Source is processing or already being deleted")
        self.rag_state = "deleting"

        if self.asset and self.asset.file_path and self.asset.owned:
            try:
                await asyncio.to_thread(
                    get_artifact_store().delete,
                    self.asset.file_path,
                    "sources",
                    UPLOADS_FOLDER,
                )
            except Exception as exc:
                await self._release_deletion_claim(source_id)
                raise ExternalServiceError(
                    "Source artifact cleanup failed; the source was not deleted"
                ) from exc
        try:
            return await super().delete()
        except Exception:
            await self._release_deletion_claim(source_id)
            raise

    async def _release_deletion_claim(self, source_id: RecordID) -> None:
        try:
            await repo_query(
                "UPDATE $source_id SET rag_state = NONE WHERE rag_state = 'deleting';",
                {"source_id": source_id},
            )
            self.rag_state = None
        except Exception as exc:
            logger.error(f"Failed to release deletion claim for {source_id}: {exc}")
