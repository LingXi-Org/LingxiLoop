"""Minimal source extraction for the production RAG profile."""

import asyncio
import csv
import io
import ipaddress
import json
import socket
import zipfile
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx
from docx import Document
from pypdf import PdfReader

from open_notebook.exceptions import ExternalServiceError, InvalidInputError
from open_notebook.utils.url_validation import PinnedHttpTarget

ALLOWED_FILE_SUFFIXES = {".pdf", ".docx", ".txt", ".md", ".markdown", ".csv", ".json"}
MAX_SOURCE_BYTES = 25 * 1024 * 1024
MAX_DOCX_ENTRIES = 10_000
MAX_DOCX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
MAX_REDIRECTS = 5


@dataclass(frozen=True)
class ExtractedContent:
    title: str | None
    content: str


class _VisibleHtmlParser(HTMLParser):
    _suppressed_tags = {"script", "style", "noscript", "svg", "canvas"}
    _block_tags = {
        "article",
        "br",
        "div",
        "footer",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "header",
        "li",
        "main",
        "p",
        "section",
        "table",
        "td",
        "th",
        "tr",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._suppressed = 0
        self._in_title = False
        self._parts: list[str] = []
        self._title_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        normalized = tag.lower()
        if normalized in self._suppressed_tags:
            self._suppressed += 1
        elif normalized == "title":
            self._in_title = True
        elif not self._suppressed and normalized in self._block_tags:
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        normalized = tag.lower()
        if normalized in self._suppressed_tags and self._suppressed:
            self._suppressed -= 1
        elif normalized == "title":
            self._in_title = False
        elif not self._suppressed and normalized in self._block_tags:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._suppressed:
            return
        if self._in_title:
            self._title_parts.append(data)
        self._parts.append(data)

    def extracted(self) -> ExtractedContent:
        title = " ".join(" ".join(self._title_parts).split()) or None
        lines = [" ".join(line.split()) for line in "".join(self._parts).splitlines()]
        content = "\n".join(line for line in lines if line)
        return ExtractedContent(title=title, content=content)


def _decode_text(data: bytes) -> str:
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        return data.decode("utf-16")
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise InvalidInputError(
            "Text sources must use UTF-8 or UTF-16 encoding"
        ) from exc


def validate_supported_file(file_path: str) -> None:
    path = Path(file_path)
    suffix = path.suffix.lower()
    if suffix not in ALLOWED_FILE_SUFFIXES:
        raise InvalidInputError(
            "Supported uploads are PDF, DOCX, TXT, Markdown, CSV, and JSON"
        )
    if path.stat().st_size > MAX_SOURCE_BYTES:
        raise InvalidInputError("File exceeds the 25 MiB limit")
    if suffix == ".pdf":
        if b"%PDF-" not in path.read_bytes()[:1024]:
            raise InvalidInputError("Uploaded PDF has an invalid signature")
        return
    if suffix == ".docx":
        try:
            with zipfile.ZipFile(path) as archive:
                entries = archive.infolist()
                names = {entry.filename for entry in entries}
        except (OSError, zipfile.BadZipFile) as exc:
            raise InvalidInputError("Uploaded DOCX is not a valid document") from exc
        if (
            len(entries) > MAX_DOCX_ENTRIES
            or sum(entry.file_size for entry in entries) > MAX_DOCX_UNCOMPRESSED_BYTES
        ):
            raise InvalidInputError("Uploaded DOCX expands beyond the safety limit")
        if "[Content_Types].xml" not in names or "word/document.xml" not in names:
            raise InvalidInputError("Uploaded DOCX is not a valid document")
        return
    text = _decode_text(path.read_bytes())
    if suffix == ".json":
        try:
            json.loads(text)
        except json.JSONDecodeError as exc:
            raise InvalidInputError("Uploaded JSON is invalid") from exc
    elif suffix == ".csv":
        try:
            next(csv.reader(io.StringIO(text)), None)
        except csv.Error as exc:
            raise InvalidInputError("Uploaded CSV is invalid") from exc


def _extract_file(file_path: str) -> ExtractedContent:
    validate_supported_file(file_path)
    path = Path(file_path)
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        reader = PdfReader(path)
        if reader.is_encrypted:
            raise InvalidInputError("Encrypted PDFs are not supported")
        pages = [(page.extract_text() or "").strip() for page in reader.pages]
        content = "\n\n".join(
            f"[[PAGE:{page_number}]]\n{page}"
            for page_number, page in enumerate(pages, start=1)
            if page
        )
    elif suffix == ".docx":
        document = Document(path)
        blocks = [paragraph.text.strip() for paragraph in document.paragraphs]
        for table in document.tables:
            blocks.extend(
                "\t".join(cell.text.strip() for cell in row.cells) for row in table.rows
            )
        content = "\n".join(block for block in blocks if block)
    else:
        content = _decode_text(path.read_bytes())
        if suffix == ".json":
            content = json.dumps(json.loads(content), ensure_ascii=False, indent=2)
    if not content.strip():
        raise InvalidInputError("Source extraction produced no text")
    return ExtractedContent(title=path.stem, content=content)


def _reject_non_public_ip(address: str, hostname: str) -> None:
    try:
        parsed = ipaddress.ip_address(address)
    except ValueError as exc:
        raise InvalidInputError(f"Invalid address returned for {hostname!r}") from exc
    if not parsed.is_global:
        raise InvalidInputError(
            f"URL host {hostname!r} resolves to a non-public address"
        )


async def prepare_public_http_target(url: str) -> PinnedHttpTarget:
    parsed = urlsplit(url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise InvalidInputError("URL sources must use http or https")
    if parsed.username is not None or parsed.password is not None:
        raise InvalidInputError("URL credentials are not allowed")
    hostname = parsed.hostname
    if not hostname:
        raise InvalidInputError("URL hostname is required")
    try:
        port = parsed.port
    except ValueError as exc:
        raise InvalidInputError("URL port is invalid") from exc

    try:
        literal = ipaddress.ip_address(hostname)
    except ValueError:
        try:
            resolved = await asyncio.to_thread(
                socket.getaddrinfo,
                hostname,
                port or (443 if parsed.scheme == "https" else 80),
                type=socket.SOCK_STREAM,
            )
        except socket.gaierror as exc:
            raise InvalidInputError(f"Could not resolve URL host {hostname!r}") from exc
        addresses = sorted({str(row[4][0]) for row in resolved})
        if not addresses:
            raise InvalidInputError(f"Could not resolve URL host {hostname!r}")
        for address in addresses:
            _reject_non_public_ip(address, hostname)
        pinned_ip = next(
            (value for value in addresses if ":" not in value), addresses[0]
        )
    else:
        _reject_non_public_ip(str(literal), hostname)
        pinned_ip = str(literal)

    url_host = f"[{pinned_ip}]" if ":" in pinned_ip else pinned_ip
    netloc = f"{url_host}:{port}" if port is not None else url_host
    ascii_hostname = hostname.encode("idna").decode("ascii")
    host_header = f"{ascii_hostname}:{port}" if port is not None else ascii_hostname
    pinned_url = urlunsplit(
        (parsed.scheme, netloc, parsed.path or "/", parsed.query, "")
    )
    extensions = {"sni_hostname": ascii_hostname} if parsed.scheme == "https" else {}
    return PinnedHttpTarget(
        url=pinned_url,
        headers={"Host": host_header},
        extensions=extensions,
    )


async def _read_bounded_response(response: httpx.Response) -> bytes:
    declared = response.headers.get("content-length")
    if declared:
        try:
            if int(declared) > MAX_SOURCE_BYTES:
                raise InvalidInputError("URL response exceeds the 25 MiB limit")
        except ValueError:
            pass
    body = bytearray()
    async for chunk in response.aiter_bytes():
        body.extend(chunk)
        if len(body) > MAX_SOURCE_BYTES:
            raise InvalidInputError("URL response exceeds the 25 MiB limit")
    return bytes(body)


async def _extract_url(url: str) -> ExtractedContent:
    current_url = url
    async with httpx.AsyncClient(timeout=30.0, trust_env=False) as client:
        for redirect_count in range(MAX_REDIRECTS + 1):
            target = await prepare_public_http_target(current_url)
            request = client.build_request(
                "GET",
                target.url,
                headers={
                    **target.headers,
                    "Accept": "text/html, text/plain, application/json",
                },
                extensions=target.extensions,
            )
            response = await client.send(request, stream=True)
            try:
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location or redirect_count == MAX_REDIRECTS:
                        raise InvalidInputError(
                            "URL redirect chain is invalid or too long"
                        )
                    current_url = urljoin(current_url, location)
                    continue
                try:
                    response.raise_for_status()
                except httpx.HTTPStatusError as exc:
                    raise ExternalServiceError(
                        f"URL source returned HTTP {response.status_code}"
                    ) from exc
                content_type = (
                    response.headers.get("content-type", "").split(";", 1)[0].lower()
                )
                if content_type and not (
                    content_type.startswith("text/")
                    or content_type in {"application/json", "application/xhtml+xml"}
                ):
                    raise InvalidInputError(
                        f"URL content type {content_type!r} is not supported"
                    )
                body = await _read_bounded_response(response)
            finally:
                await response.aclose()
            text = _decode_text(body)
            if (
                content_type in {"text/html", "application/xhtml+xml"}
                or "<html" in text[:500].lower()
            ):
                parser = _VisibleHtmlParser()
                parser.feed(text)
                extracted = parser.extracted()
            elif content_type == "application/json":
                extracted = ExtractedContent(
                    title=urlsplit(current_url).hostname,
                    content=json.dumps(json.loads(text), ensure_ascii=False, indent=2),
                )
            else:
                extracted = ExtractedContent(
                    title=urlsplit(current_url).hostname,
                    content=text,
                )
            if not extracted.content.strip():
                raise InvalidInputError("URL extraction produced no text")
            return extracted
    raise InvalidInputError("URL redirect chain is too long")


async def extract_content(
    *, url: str | None = None, file_path: str | None = None, content: str | None = None
) -> ExtractedContent:
    supplied = sum(value is not None for value in (url, file_path, content))
    if supplied != 1:
        raise InvalidInputError("Exactly one source input must be provided")
    if url is not None:
        extracted = await _extract_url(url)
    elif file_path is not None:
        extracted = await asyncio.to_thread(_extract_file, file_path)
    else:
        assert content is not None
        if not content.strip():
            raise InvalidInputError("Text source is empty")
        extracted = ExtractedContent(title=None, content=content)
    if len(extracted.content.encode("utf-8")) > MAX_SOURCE_BYTES:
        raise InvalidInputError("Extracted text exceeds the 25 MiB limit")
    return extracted
