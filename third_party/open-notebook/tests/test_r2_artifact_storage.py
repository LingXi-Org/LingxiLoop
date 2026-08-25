import io
from pathlib import Path

import pytest

from open_notebook.artifact_storage import ArtifactStore
from open_notebook.podcasts.audio_paths import (
    audio_file_available,
    delete_audio_file,
    open_audio_download,
    persist_audio_file,
)


class FakeClientError(Exception):
    def __init__(self, status: int):
        self.response = {"ResponseMetadata": {"HTTPStatusCode": status}}


class FakeS3:
    class exceptions:
        ClientError = FakeClientError

    def __init__(self):
        self.objects: dict[tuple[str, str], tuple[bytes, str]] = {}

    def upload_file(self, filename, bucket, key, ExtraArgs=None):
        content_type = (ExtraArgs or {}).get("ContentType", "application/octet-stream")
        self.objects[(bucket, key)] = (Path(filename).read_bytes(), content_type)

    def download_file(self, bucket, key, filename):
        Path(filename).write_bytes(self.objects[(bucket, key)][0])

    def head_object(self, *, Bucket, Key):
        if (Bucket, Key) not in self.objects:
            raise FakeClientError(404)

    def delete_object(self, *, Bucket, Key):
        self.objects.pop((Bucket, Key), None)

    def get_object(self, *, Bucket, Key):
        content, content_type = self.objects[(Bucket, Key)]
        return {
            "Body": io.BytesIO(content),
            "ContentType": content_type,
            "ContentLength": len(content),
        }


@pytest.fixture
def r2_env(monkeypatch):
    values = {
        "R2_ENDPOINT": "https://account.r2.cloudflarestorage.com",
        "R2_BUCKET": "lingxiloop",
        "R2_ACCESS_KEY_ID": "test-key",
        "R2_SECRET_ACCESS_KEY": "test-secret",
        "OPEN_NOTEBOOK_R2_ENABLED": "auto",
        "OPEN_NOTEBOOK_R2_PREFIX": "open-notebook",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)


def test_local_fallback_preserves_path(monkeypatch, tmp_path):
    for name in (
        "R2_ENDPOINT",
        "R2_BUCKET",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("OPEN_NOTEBOOK_R2_ENABLED", "auto")
    source = tmp_path / "source.txt"
    source.write_text("local", encoding="utf-8")
    store = ArtifactStore()
    assert store.persist_file(source, "sources") == str(source)


def test_explicit_r2_requires_complete_configuration(monkeypatch):
    monkeypatch.setenv("OPEN_NOTEBOOK_R2_ENABLED", "true")
    monkeypatch.delenv("R2_BUCKET", raising=False)
    with pytest.raises(RuntimeError, match="missing"):
        ArtifactStore(client=FakeS3())


def test_r2_round_trip_and_namespace_isolation(r2_env, tmp_path):
    client = FakeS3()
    store = ArtifactStore(client=client)
    source = tmp_path / "report.pdf"
    source.write_bytes(b"knowledge")

    reference = store.persist_file(source, "sources")
    assert reference.startswith("r2://open-notebook/sources/")
    assert store.exists(reference, "sources", tmp_path)

    materialized = store.materialize(reference, "sources", tmp_path)
    try:
        assert materialized.temporary
        assert materialized.path.read_bytes() == b"knowledge"
    finally:
        materialized.release()
    assert not materialized.path.exists()

    download = store.open_download(reference, "sources")
    assert b"".join(download.chunks()) == b"knowledge"
    with pytest.raises(ValueError, match="outside"):
        store.open_download(reference, "podcasts")

    store.delete(reference, "sources", tmp_path)
    assert not store.exists(reference, "sources", tmp_path)


def test_local_reference_cannot_escape_root(monkeypatch, tmp_path):
    monkeypatch.setenv("OPEN_NOTEBOOK_R2_ENABLED", "false")
    store = ArtifactStore()
    outside = tmp_path.parent / "secret.txt"
    outside.write_text("secret", encoding="utf-8")
    with pytest.raises(ValueError, match="outside"):
        store.delete(str(outside), "sources", tmp_path)
    assert outside.exists()


def test_podcast_final_audio_moves_to_r2(r2_env, monkeypatch, tmp_path):
    client = FakeS3()
    store = ArtifactStore(client=client)
    monkeypatch.setattr("open_notebook.artifact_storage._store", store)
    monkeypatch.setattr(
        "open_notebook.podcasts.audio_paths.PODCASTS_FOLDER", str(tmp_path)
    )
    audio = tmp_path / "episodes" / "episode-1" / "final.mp3"
    audio.parent.mkdir(parents=True)
    audio.write_bytes(b"podcast")

    reference = persist_audio_file(audio)
    assert reference.startswith("r2://open-notebook/podcasts/")
    assert not audio.exists()
    assert audio_file_available(reference)
    assert b"".join(open_audio_download(reference).chunks()) == b"podcast"

    delete_audio_file(reference)
    assert not audio_file_available(reference)
