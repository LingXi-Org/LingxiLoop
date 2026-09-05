"""R2-only durable storage for native Open Notebook Source artifacts."""

from __future__ import annotations

import mimetypes
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import BinaryIO, Optional

R2_SCHEME = "r2://"
_NAMESPACES = {"sources"}


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
        if not all(required.values()):
            missing = [name for name, value in required.items() if not value]
            raise RuntimeError(
                "Open Notebook RAG requires all R2 settings; missing: "
                + ", ".join(missing)
            )
        self.enabled = True

        prefix = os.environ.get("OPEN_NOTEBOOK_R2_PREFIX", "open-notebook").strip()
        self.prefix = prefix.strip("/")
        if not self.prefix or ".." in PurePosixPath(self.prefix).parts:
            raise ValueError("OPEN_NOTEBOOK_R2_PREFIX must be a safe non-empty prefix")

        self.bucket = required["bucket"]
        self.client = client
        if self.client is None:
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
        canonical_source = namespace == "sources" and key.startswith("knowledge-sources/")
        if (not key.startswith(expected) and not canonical_source) or ".." in PurePosixPath(key).parts:
            raise ValueError("Artifact reference is outside its namespace")
        return key

    def materialize(
        self,
        reference: str,
        namespace: str,
        local_root: str | Path,
        max_bytes: int | None = None,
    ) -> MaterializedArtifact:
        key = self._key(reference, namespace)
        if max_bytes is not None:
            size = int(
                self.client.head_object(Bucket=self.bucket, Key=key).get(
                    "ContentLength", -1
                )
            )
            if size < 0 or size > max_bytes:
                raise ValueError("Artifact exceeds the source size limit")
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
        key = self._key(reference, namespace)
        self.client.delete_object(Bucket=self.bucket, Key=key)

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
