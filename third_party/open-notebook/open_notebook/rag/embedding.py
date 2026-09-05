"""Minimal OpenAI-compatible embedding client for the RAG runtime."""

import asyncio
import os
from typing import Any

import httpx

from open_notebook.exceptions import ConfigurationError, ExternalServiceError

DEFAULT_BATCH_SIZE = 50
MAX_ATTEMPTS = 3


def embedding_configuration() -> tuple[str, str, str]:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    base_url = os.environ.get("OPENAI_BASE_URL", "").strip().rstrip("/")
    model = os.environ.get("OPENAI_EMBEDDING_MODEL", "").strip()
    missing = [
        name
        for name, value in (
            ("OPENAI_API_KEY", api_key),
            ("OPENAI_BASE_URL", base_url),
            ("OPENAI_EMBEDDING_MODEL", model),
        )
        if not value
    ]
    if missing:
        raise ConfigurationError(
            "RAG embedding configuration is incomplete; missing: " + ", ".join(missing)
        )
    return api_key, base_url, model


def _batch_size() -> int:
    raw = os.environ.get("OPEN_NOTEBOOK_EMBEDDING_BATCH_SIZE", "").strip()
    if not raw:
        return DEFAULT_BATCH_SIZE
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigurationError(
            "OPEN_NOTEBOOK_EMBEDDING_BATCH_SIZE must be an integer"
        ) from exc
    if value < 1 or value > 2048:
        raise ConfigurationError(
            "OPEN_NOTEBOOK_EMBEDDING_BATCH_SIZE must be between 1 and 2048"
        )
    return value


def _parse_embeddings(payload: Any, expected: int) -> list[list[float]]:
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise ExternalServiceError("Embedding provider returned an invalid response")
    rows = payload["data"]
    if len(rows) != expected:
        raise ExternalServiceError(
            f"Embedding provider returned {len(rows)} vectors for {expected} inputs"
        )
    try:
        ordered = sorted(rows, key=lambda row: int(row.get("index", 0)))
        vectors = [[float(value) for value in row["embedding"]] for row in ordered]
    except (KeyError, TypeError, ValueError) as exc:
        raise ExternalServiceError(
            "Embedding provider returned malformed vectors"
        ) from exc
    dimensions = {len(vector) for vector in vectors}
    if dimensions == {0} or len(dimensions) != 1:
        raise ExternalServiceError(
            "Embedding provider returned empty or inconsistent vectors"
        )
    return vectors


async def generate_embeddings(texts: list[str], company_id: str) -> list[list[float]]:
    if not texts:
        return []
    if any(not text or not text.strip() for text in texts):
        raise ValueError("Cannot embed empty text")

    api_key, base_url, model = embedding_configuration()
    endpoint = (
        base_url if base_url.endswith("/embeddings") else f"{base_url}/embeddings"
    )
    headers = {
        "Authorization": f"Bearer {api_key}",
        "X-Lingxi-Company-Id": company_id,
    }
    vectors: list[list[float]] = []
    batch_size = _batch_size()

    async with httpx.AsyncClient(timeout=60.0) as client:
        for offset in range(0, len(texts), batch_size):
            batch = texts[offset : offset + batch_size]
            last_error: Exception | None = None
            for attempt in range(1, MAX_ATTEMPTS + 1):
                try:
                    response = await client.post(
                        endpoint,
                        headers=headers,
                        json={"model": model, "input": batch},
                    )
                    if response.status_code >= 400:
                        detail = response.text[:200]
                        raise ExternalServiceError(
                            f"Embedding provider returned HTTP {response.status_code}: {detail}"
                        )
                    vectors.extend(_parse_embeddings(response.json(), len(batch)))
                    last_error = None
                    break
                except (httpx.HTTPError, ValueError, ExternalServiceError) as exc:
                    last_error = exc
                    if attempt < MAX_ATTEMPTS:
                        await asyncio.sleep(2 ** (attempt - 1))
            if last_error is not None:
                if isinstance(last_error, ExternalServiceError):
                    raise last_error
                raise ExternalServiceError(
                    f"Embedding provider request failed: {last_error}"
                ) from last_error
    return vectors


async def generate_query_embedding(text: str, company_id: str) -> list[float]:
    return (await generate_embeddings([text], company_id))[0]
