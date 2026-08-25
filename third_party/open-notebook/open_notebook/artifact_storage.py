"""Private durable storage for Open Notebook binary artifacts.

R2 is enabled automatically when LingxiLoop's four core ``R2_*`` variables
are present.  SurrealDB stores opaque ``r2://`` references; browsers continue
to download through the authenticated Open Notebook/LingxiLoop APIs.
"""

from __future__ import annotations

import mimetypes
import os
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import BinaryIO, Optional

R2_SCHEME = "r2://"
_NAMESPACES = {"sources", "podcasts"}


def _truthy(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _safe_name(value: str) -> str:
    name = Path(value).name.strip()
    if not name or name in {".", ".."}:
        raise ValueError("Invalid artifact filename")
    return name


@dataclass
class MaterializedArtifact:
    path: Path
    temporary: bool = False

    def release(self) -> None:
        if self.temporary:
            self.path.unlink(missing_ok=True)


@dataclass
class ArtifactDownload:
    body: BinaryIO
    filename: str
    content_type: str
    content_length: Optional[int]

    def chunks(self, size: int = 1024 * 1024):
        try:
            while chunk := self.body.read(size):
                yield chunk
        finally:
            self.body.close()


class ArtifactStore:
    def __init__(self, *, client=None) -> None:
        required = {
            "endpoint_url": os.environ.get("R2_ENDPOINT", "").strip(),
            "bucket": os.environ.get("R2_BUCKET", "").strip(),
            "aws_access_key_id": os.environ.get("R2_ACCESS_KEY_ID", "").strip(),
            "aws_secret_access_key": os.environ.get(
                "R2_SECRET_ACCESS_KEY", ""
            ).strip(),
        }
        configured = all(required.values())
        mode = os.environ.get("OPEN_NOTEBOOK_R2_ENABLED", "auto").strip().lower()
        self.enabled = configured if mode in {"", "auto"} else _truthy(mode)
        if self.enabled and not configured:
            missing = [name for name, value in required.items() if not value]
            raise RuntimeError(
                "OPEN_NOTEBOOK_R2_ENABLED requires all R2 settings; missing: "
                + ", ".join(missing)
            )

        prefix = os.environ.get("OPEN_NOTEBOOK_R2_PREFIX", "open-notebook").strip()
        self.prefix = prefix.strip("/")
        if not self.prefix or ".." in PurePosixPath(self.prefix).parts:
            raise ValueError("OPEN_NOTEBOOK_R2_PREFIX must be a safe non-empty prefix")

        self.bucket = required["bucket"]
        self.client = client
        if self.enabled and self.client is None:
            import boto3

            self.client = boto3.client(
                "s3",
                endpoint_url=required["endpoint_url"],
                region_name="auto",
                aws_access_key_id=required["aws_access_key_id"],
                aws_secret_access_key=required["aws_secret_access_key"],
            )

    @staticmethod
    def is_object_reference(reference: str) -> bool:
        return reference.startswith(R2_SCHEME)

    def _key(self, reference: str, namespace: str) -> str:
        if namespace not in _NAMESPACES:
            raise ValueError("Unsupported artifact namespace")
        if not self.is_object_reference(reference):
            raise ValueError("Not an R2 artifact reference")
        key = reference[len(R2_SCHEME) :]
        expected = f"{self.prefix}/{namespace}/"
        if not key.startswith(expected) or ".." in PurePosixPath(key).parts:
            raise ValueError("Artifact reference is outside its namespace")
        return key

    def persist_file(
        self, local_path: str | Path, namespace: str, object_name: Optional[str] = None
    ) -> str:
        path = Path(local_path)
        if not self.enabled:
            return str(path)
        filename = _safe_name(object_name or path.name)
        key = f"{self.prefix}/{namespace}/{uuid.uuid4().hex}/{filename}"
        extra = {}
        content_type = mimetypes.guess_type(filename)[0]
        if content_type:
            extra["ContentType"] = content_type
        self.client.upload_file(str(path), self.bucket, key, ExtraArgs=extra or None)
        return f"{R2_SCHEME}{key}"

    def materialize(
        self, reference: str, namespace: str, local_root: str | Path
    ) -> MaterializedArtifact:
        if not self.is_object_reference(reference):
            path = self._contained_local(reference, local_root)
            return MaterializedArtifact(path=path)
        key = self._key(reference, namespace)
        suffix = Path(PurePosixPath(key).name).suffix
        fd, temp_name = tempfile.mkstemp(prefix="open-notebook-", suffix=suffix)
        os.close(fd)
        temp_path = Path(temp_name)
        try:
            self.client.download_file(self.bucket, key, str(temp_path))
            return MaterializedArtifact(path=temp_path, temporary=True)
        except Exception:
            temp_path.unlink(missing_ok=True)
            raise

    def exists(self, reference: str, namespace: str, local_root: str | Path) -> bool:
        if not self.is_object_reference(reference):
            try:
                return self._contained_local(reference, local_root).is_file()
            except ValueError:
                return False
        key = self._key(reference, namespace)
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except self.client.exceptions.ClientError as error:
            status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if status == 404:
                return False
            raise

    def delete(self, reference: str, namespace: str, local_root: str | Path) -> None:
        if self.is_object_reference(reference):
            key = self._key(reference, namespace)
            self.client.delete_object(Bucket=self.bucket, Key=key)
            return
        self._contained_local(reference, local_root).unlink(missing_ok=True)

    def open_download(self, reference: str, namespace: str) -> ArtifactDownload:
        key = self._key(reference, namespace)
        response = self.client.get_object(Bucket=self.bucket, Key=key)
        filename = PurePosixPath(key).name
        return ArtifactDownload(
            body=response["Body"],
            filename=filename,
            content_type=response.get("ContentType")
            or mimetypes.guess_type(filename)[0]
            or "application/octet-stream",
            content_length=response.get("ContentLength"),
        )

    @staticmethod
    def _contained_local(reference: str, local_root: str | Path) -> Path:
        root = Path(local_root).resolve()
        path = Path(reference).resolve()
        try:
            path.relative_to(root)
        except ValueError as error:
            raise ValueError("Artifact path is outside its local root") from error
        return path


_store: Optional[ArtifactStore] = None


def get_artifact_store() -> ArtifactStore:
    global _store
    if _store is None:
        _store = ArtifactStore()
    return _store


def reset_artifact_store() -> None:
    """Reset the lazy singleton (tests and process-level configuration reloads)."""
    global _store
    _store = None
