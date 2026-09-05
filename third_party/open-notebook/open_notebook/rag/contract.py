"""Validation for the immutable production embedding contract."""

from dataclasses import dataclass

from open_notebook.database.repository import repo_query
from open_notebook.exceptions import ConfigurationError
from open_notebook.rag.embedding import embedding_configuration


@dataclass(frozen=True)
class EmbeddingContract:
    model: str
    base_url: str
    dimensions: int


async def get_embedding_contract() -> EmbeddingContract:
    rows = await repo_query("SELECT * FROM open_notebook:rag_embedding_contract;")
    if not rows:
        raise ConfigurationError("RAG embedding contract has not been initialized")
    row = rows[0]
    dimensions = int(row.get("dimensions") or 0)
    model = str(row.get("model") or "")
    base_url = str(row.get("base_url") or "").rstrip("/")
    if not model or not base_url or dimensions <= 0:
        raise ConfigurationError("RAG embedding contract is incomplete")

    _, configured_base_url, configured_model = embedding_configuration()
    if configured_model != model or configured_base_url.rstrip("/") != base_url:
        raise ConfigurationError(
            "Embedding endpoint/model changed; reset the knowledge plane"
        )
    return EmbeddingContract(
        model=model,
        base_url=base_url,
        dimensions=dimensions,
    )


async def validate_embedding_vectors(vectors: list[list[float]]) -> int:
    contract = await get_embedding_contract()
    dimensions = {len(vector) for vector in vectors}
    if not vectors or dimensions != {contract.dimensions}:
        raise ConfigurationError(
            "Embedding vector dimensions changed; reset the knowledge plane"
        )
    return contract.dimensions
