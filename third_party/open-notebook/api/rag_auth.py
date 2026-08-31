"""Bearer authentication used by the internal-only RAG API."""

import os
import secrets
from pathlib import Path

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp


def read_secret(name: str) -> str:
    direct = os.environ.get(name, "").strip()
    if direct:
        return direct
    secret_file = os.environ.get(f"{name}_FILE", "").strip()
    if not secret_file:
        return ""
    try:
        return Path(secret_file).read_text(encoding="utf-8").strip()
    except OSError:
        return ""


class RagPasswordAuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, excluded_paths: list[str]) -> None:
        super().__init__(app)
        self.password = read_secret("OPEN_NOTEBOOK_PASSWORD")
        self.excluded_paths = set(excluded_paths)

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if request.url.path in self.excluded_paths:
            return await call_next(request)
        auth_header = request.headers.get("Authorization", "")
        try:
            scheme, credential = auth_header.split(" ", 1)
        except ValueError:
            scheme, credential = "", ""
        if (
            not self.password
            or scheme.lower() != "bearer"
            or not secrets.compare_digest(credential, self.password)
        ):
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or missing bearer credential"},
                headers={"WWW-Authenticate": "Bearer"},
            )
        return await call_next(request)
