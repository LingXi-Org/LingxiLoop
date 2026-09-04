"""Small token-window chunker used by the production RAG worker."""

import os

import tiktoken

from open_notebook.exceptions import ConfigurationError

DEFAULT_CHUNK_TOKENS = 800
DEFAULT_CHUNK_OVERLAP = 100


def _integer_setting(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigurationError(f"{name} must be an integer") from exc
    if value < minimum or value > maximum:
        raise ConfigurationError(f"{name} must be between {minimum} and {maximum}")
    return value


def chunk_text(text: str) -> list[str]:
    if not text or not text.strip():
        return []
    chunk_tokens = _integer_setting(
        "OPEN_NOTEBOOK_RAG_CHUNK_TOKENS",
        DEFAULT_CHUNK_TOKENS,
        100,
        8_000,
    )
    overlap = _integer_setting(
        "OPEN_NOTEBOOK_RAG_CHUNK_OVERLAP",
        DEFAULT_CHUNK_OVERLAP,
        0,
        chunk_tokens - 1,
    )
    encoding = tiktoken.get_encoding("o200k_base")
    tokens = encoding.encode(text)
    step = chunk_tokens - overlap
    chunks: list[str] = []
    for start in range(0, len(tokens), step):
        chunk = encoding.decode(tokens[start : start + chunk_tokens]).strip()
        if chunk:
            chunks.append(chunk)
        if start + chunk_tokens >= len(tokens):
            break
    return chunks
