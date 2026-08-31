"""Hardened FastAPI entrypoint exposing only LingxiLoop's RAG contract."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from loguru import logger

from api.middleware import MaxBodySizeMiddleware
from api.rag_auth import RagPasswordAuthMiddleware, read_secret
from api.rag_router import router
from open_notebook.exceptions import (
    ConfigurationError,
    ExternalServiceError,
    InvalidInputError,
    NotFoundError,
    OpenNotebookError,
)
from open_notebook.rag.runtime import (
    RagRuntimeState,
    initialize_runtime,
    readiness_details,
)
from open_notebook.utils.proxy import ensure_internal_no_proxy

ensure_internal_no_proxy()
RAG_FILE_MAX_SIZE = 25 * 1024 * 1024
# A 25 MiB file needs bounded room for multipart headers and the scope fields.
RAG_REQUEST_MAX_SIZE = RAG_FILE_MAX_SIZE + 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not read_secret("OPEN_NOTEBOOK_PASSWORD"):
        raise RuntimeError("OPEN_NOTEBOOK_PASSWORD is required for the RAG profile")
    logger.info("Initializing Open Notebook RAG profile")
    app.state.rag_runtime = await initialize_runtime()
    app.state.rag_ready = True
    try:
        yield
    finally:
        app.state.rag_ready = False


app = FastAPI(
    title="Open Notebook RAG API",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)
app.state.rag_ready = False
app.add_middleware(
    RagPasswordAuthMiddleware,
    excluded_paths=["/health", "/readyz"],
)
app.add_middleware(MaxBodySizeMiddleware, max_body_size=RAG_REQUEST_MAX_SIZE)
app.include_router(router, prefix="/api")


@app.exception_handler(NotFoundError)
async def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(InvalidInputError)
async def invalid_input_handler(request: Request, exc: InvalidInputError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(ConfigurationError)
async def configuration_handler(
    request: Request, exc: ConfigurationError
) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(ExternalServiceError)
async def external_service_handler(
    request: Request, exc: ExternalServiceError
) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(OpenNotebookError)
async def domain_error_handler(request: Request, exc: OpenNotebookError) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "healthy", "profile": "rag"}


@app.get("/readyz")
async def ready(request: Request) -> dict[str, object]:
    if not request.app.state.rag_ready:
        raise HTTPException(status_code=503, detail="RAG runtime is not initialized")
    state: RagRuntimeState = request.app.state.rag_runtime
    return await readiness_details(state)
