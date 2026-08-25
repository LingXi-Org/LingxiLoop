"""Single choke point for podcast episode audio file paths (#1030).

``PodcastEpisode.audio_file`` stores either a path relative to
``PODCASTS_FOLDER`` or a private ``r2://`` object reference. Helpers enforce
containment at every place values cross the DB boundary:

- ``to_relative_audio_path()`` — write side (podcast generation command):
  converts the generated file path to the relative storage form and refuses
  to produce a value outside the podcasts root, so the DB never holds an
  absolute or escaping path.
- ``resolve_contained_audio_path()`` — read side (every API consumption
  point: stream, list/get, delete, retry): joins the stored value with
  ``PODCASTS_FOLDER``, resolves symlinks/``..`` and verifies containment.
  Any absolute, ``file://`` or escaping value is treated as legacy-invalid
  and returns ``None`` (callers keep today's 403/404 behavior from #1018).

Storing relative paths makes path traversal unrepresentable for new rows
and lets previously generated episodes survive a ``DATA_FOLDER`` move.
Migration 21 converts pre-existing rows written under the known roots.
"""

import os
from pathlib import Path
from typing import Optional, Union
from urllib.parse import unquote, urlparse

from open_notebook.artifact_storage import ArtifactDownload, get_artifact_store
from open_notebook.config import PODCASTS_FOLDER


def podcasts_root() -> Path:
    """Real (symlink-resolved, absolute) path of the podcasts output root.

    Computed on every call rather than at import time so tests can
    monkeypatch ``PODCASTS_FOLDER`` on this module.
    """
    return Path(os.path.realpath(PODCASTS_FOLDER))


def to_relative_audio_path(audio_path: Union[str, Path]) -> str:
    """Convert a generated audio file path to the DB storage form.

    Accepts the absolute (or CWD-relative) path produced by podcast-creator,
    including the legacy ``file://`` URI form, and returns it relative to
    ``PODCASTS_FOLDER`` as a POSIX-style string.

    Raises:
        ValueError: if the path resolves outside the podcasts root — the DB
            must never hold an absolute or escaping value. ValueError also
            marks the generation job as permanently failed (no retry).
    """
    raw = str(audio_path)
    if raw.startswith("file://"):
        raw = unquote(urlparse(raw).path)
    resolved = Path(os.path.realpath(raw))
    root = podcasts_root()
    if resolved == root or not resolved.is_relative_to(root):
        raise ValueError(
            f"Generated audio file path is outside the podcasts folder: {audio_path}"
        )
    return resolved.relative_to(root).as_posix()


def resolve_contained_audio_path(audio_file: Optional[str]) -> Optional[Path]:
    """Resolve a stored ``audio_file`` value to a real filesystem path.

    Joins the stored relative path with ``PODCASTS_FOLDER``, resolves
    symlinks and ``..`` components, and verifies the result stays inside the
    podcasts root.

    Returns ``None`` for anything that must not be followed:
    - empty/None values
    - absolute paths and ``file://`` URIs (legacy rows migration 21 could
      not convert — exactly the out-of-root cases #1018's guards reject)
    - relative paths that escape the root (``..`` or symlink traversal)
    """
    if not audio_file:
        return None
    if "://" in audio_file:
        return None
    candidate = Path(audio_file)
    if candidate.is_absolute():
        return None
    root = podcasts_root()
    resolved = Path(os.path.realpath(root / candidate))
    if resolved == root or not resolved.is_relative_to(root):
        return None
    return resolved


def persist_audio_file(audio_path: Union[str, Path]) -> str:
    """Persist generated audio to R2, retaining relative local fallback."""
    relative = to_relative_audio_path(audio_path)
    local_path = podcasts_root() / relative
    store = get_artifact_store()
    reference = store.persist_file(local_path, "podcasts", local_path.name)
    if store.is_object_reference(reference):
        local_path.unlink(missing_ok=True)
        return reference
    return relative


def audio_file_available(audio_file: Optional[str]) -> bool:
    if not audio_file:
        return False
    store = get_artifact_store()
    if store.is_object_reference(audio_file):
        return store.exists(audio_file, "podcasts", PODCASTS_FOLDER)
    path = resolve_contained_audio_path(audio_file)
    return bool(path and path.is_file())


def delete_audio_file(audio_file: str) -> None:
    store = get_artifact_store()
    if store.is_object_reference(audio_file):
        store.delete(audio_file, "podcasts", PODCASTS_FOLDER)
        return
    path = resolve_contained_audio_path(audio_file)
    if path is None:
        raise ValueError("Audio path is outside the podcasts directory")
    path.unlink(missing_ok=True)


def open_audio_download(audio_file: str) -> ArtifactDownload:
    return get_artifact_store().open_download(audio_file, "podcasts")
