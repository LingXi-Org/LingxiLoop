"""Strict wire models for the production RAG API."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from open_notebook.rag.extraction import MAX_SOURCE_BYTES


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class NotebookCreate(StrictModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=4000)
    external_key: str = Field(min_length=1, max_length=255)


class NotebookUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    archived: bool | None = None


class NotebookResponse(StrictModel):
    id: str
    name: str
    description: str
    archived: bool
    created: str
    updated: str
    source_count: int
    note_count: int = 0
    external_key: str | None = None


class SourceJsonCreate(StrictModel):
    type: Literal["text", "link", "file"]
    notebooks: list[str] = Field(min_length=1, max_length=50)
    title: str | None = Field(default=None, max_length=500)
    content: str | None = None
    url: str | None = Field(default=None, max_length=4096)
    storage_key: str | None = Field(default=None, max_length=1024)
    filename: str | None = Field(default=None, max_length=500)
    mime_type: str | None = Field(default=None, max_length=200)
    size_bytes: int | None = Field(default=None, ge=1, le=MAX_SOURCE_BYTES)
    company_id: str = Field(min_length=1, max_length=255)

    @model_validator(mode="after")
    def validate_content(self) -> "SourceJsonCreate":
        if self.type == "text" and (not self.content or not self.content.strip()):
            raise ValueError("content is required for text sources")
        if self.type == "text" and self.url is not None:
            raise ValueError("url is not accepted for text sources")
        if self.type == "link" and (not self.url or not self.url.strip()):
            raise ValueError("url is required for link sources")
        if self.type == "link" and self.content is not None:
            raise ValueError("content is not accepted for link sources")
        if self.type == "file" and not all(
            (self.storage_key, self.filename, self.mime_type, self.size_bytes)
        ):
            raise ValueError("storage_key, filename, mime_type and size_bytes are required")
        if self.type != "file" and any(
            value is not None
            for value in (self.storage_key, self.filename, self.mime_type, self.size_bytes)
        ):
            raise ValueError("file fields are accepted only for file sources")
        if self.type == "file" and (self.content is not None or self.url is not None):
            raise ValueError("content and url are not accepted for file sources")
        return self


class AssetResponse(StrictModel):
    file_path: str | None = None
    url: str | None = None


class SourceResponse(StrictModel):
    id: str
    title: str | None
    topics: list[str]
    asset: AssetResponse | None
    full_text: str | None
    embedded: bool
    embedded_chunks: int
    created: str
    updated: str
    command_id: str | None = None
    status: str | None = None
    processing_info: dict[str, Any] | None = None
    notebooks: list[str] = Field(default_factory=list)


class SourceStatusResponse(StrictModel):
    status: str | None
    message: str
    processing_info: dict[str, Any] | None = None
    command_id: str | None = None
    embedded_chunks: int


class PresentationMaterialBlock(StrictModel):
    chunk_id: str
    ordinal: int = Field(ge=0)
    text: str = Field(min_length=1, max_length=4_000)
    page_number: int | None = Field(default=None, ge=1)
    section_title: str | None = Field(default=None, max_length=200)


class PresentationMaterialAsset(StrictModel):
    asset_id: str
    mime_type: Literal["image/png", "image/jpeg", "image/webp", "image/svg+xml"]
    data_uri: str
    page_number: int | None = Field(default=None, ge=1)
    section_title: str | None = Field(default=None, max_length=200)
    width: int | None = Field(default=None, ge=1)
    height: int | None = Field(default=None, ge=1)


class PresentationMaterialResponse(StrictModel):
    version: Literal["PresentationMaterialV1"] = "PresentationMaterialV1"
    source_id: str
    title: str
    blocks: list[PresentationMaterialBlock] = Field(max_length=400)
    assets: list[PresentationMaterialAsset] = Field(default_factory=list, max_length=40)
    truncated: bool


class SearchRequest(StrictModel):
    query: str = Field(min_length=1, max_length=16_000)
    notebook_id: str
    source_ids: list[str] = Field(min_length=1, max_length=1000)
    type: Literal["text", "vector"] = "vector"
    limit: int = Field(default=8, ge=1, le=100)
    minimum_score: float = Field(default=0.2, ge=0, le=1)
    company_id: str = Field(min_length=1, max_length=255)


class SearchResponse(StrictModel):
    results: list[dict[str, Any]]
    total_count: int
    search_type: Literal["text", "vector"]
