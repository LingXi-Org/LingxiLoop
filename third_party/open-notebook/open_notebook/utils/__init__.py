"""Utility exports loaded lazily.

Keeping this package initializer side-effect free is important for the
production RAG image: importing a focused helper such as ``utils.proxy`` must
not pull in chat, model-provider, or encryption dependencies.  The public
exports remain compatible with the upstream application and are imported only
when a caller actually asks for them.
"""

from importlib import import_module
from typing import Any

_EXPORTS = {
    "CHUNK_SIZE": (".chunking", "CHUNK_SIZE"),
    "ContentType": (".chunking", "ContentType"),
    "chunk_text": (".chunking", "chunk_text"),
    "detect_content_type": (".chunking", "detect_content_type"),
    "detect_content_type_from_extension": (
        ".chunking",
        "detect_content_type_from_extension",
    ),
    "detect_content_type_from_heuristics": (
        ".chunking",
        "detect_content_type_from_heuristics",
    ),
    "generate_embedding": (".embedding", "generate_embedding"),
    "generate_embeddings": (".embedding", "generate_embeddings"),
    "mean_pool_embeddings": (".embedding", "mean_pool_embeddings"),
    "remove_non_ascii": (".text_utils", "remove_non_ascii"),
    "remove_non_printable": (".text_utils", "remove_non_printable"),
    "parse_thinking_content": (".text_utils", "parse_thinking_content"),
    "clean_thinking_content": (".text_utils", "clean_thinking_content"),
    "token_count": (".token_utils", "token_count"),
    "token_cost": (".token_utils", "token_cost"),
    "compare_versions": (".version_utils", "compare_versions"),
    "get_installed_version": (".version_utils", "get_installed_version"),
    "get_version_from_github": (".version_utils", "get_version_from_github"),
    "decrypt_value": (".encryption", "decrypt_value"),
    "encrypt_value": (".encryption", "encrypt_value"),
    "full_model_dump": (".model_utils", "full_model_dump"),
}

__all__ = list(_EXPORTS)


def __getattr__(name: str) -> Any:
    target = _EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attribute = target
    value = getattr(import_module(module_name, __name__), attribute)
    globals()[name] = value
    return value
