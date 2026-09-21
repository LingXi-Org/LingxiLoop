# LingxiLoop RAG-only image. SurrealDB runs as a separate service.
FROM accel.way2api.fun/docker.io/library/python:3.12-slim-trixie AS rag-backend-builder

# Install build dependencies (uv downloads pre-built wheels for most packages)
RUN apt-get update && apt-get -o Acquire::Retries=5 install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install uv using the official method
COPY --from=accel.way2api.fun/ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Set build optimization environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV UV_HTTP_TIMEOUT=120

# Copy dependency files and minimal package structure first for better layer caching
COPY pyproject.toml uv.lock ./
COPY open_notebook/__init__.py ./open_notebook/__init__.py

RUN uv sync --frozen --no-dev --no-default-groups

ENV TIKTOKEN_CACHE_DIR=/app/tiktoken-cache
RUN mkdir -p /app/tiktoken-cache && \
    .venv/bin/python -c "import tiktoken; tiktoken.get_encoding('o200k_base')"

FROM accel.way2api.fun/docker.io/library/python:3.12-slim-trixie AS lingxiloop-rag

RUN apt-get update && apt-get -o Acquire::Retries=5 install -y --no-install-recommends \
    supervisor \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=rag-backend-builder /app/.venv /app/.venv
COPY --from=rag-backend-builder /app/tiktoken-cache /app/tiktoken-cache

COPY open_notebook/__init__.py open_notebook/config.py open_notebook/exceptions.py open_notebook/artifact_storage.py /app/open_notebook/
COPY open_notebook/database /app/open_notebook/database
COPY open_notebook/domain/__init__.py open_notebook/domain/base.py /app/open_notebook/domain/
COPY open_notebook/rag /app/open_notebook/rag
COPY open_notebook/utils/__init__.py open_notebook/utils/proxy.py open_notebook/utils/url_validation.py /app/open_notebook/utils/
COPY api/__init__.py api/middleware.py api/rag_auth.py api/rag_models.py api/rag_router.py api/rag_main.py /app/api/
COPY rag_commands.py /app/rag_commands.py
COPY supervisord.rag.conf /etc/supervisor/conf.d/supervisord.conf

ENV UV_NO_SYNC=1
ENV VIRTUAL_ENV=/app/.venv
ENV TIKTOKEN_CACHE_DIR=/app/tiktoken-cache
ENV API_HOST=0.0.0.0
ENV OPEN_NOTEBOOK_RAG_ONLY=1
ENV OPEN_NOTEBOOK_WORKER_MAX_TASKS=5

RUN mkdir -p /app/data/uploads /var/log/supervisor

EXPOSE 5055

HEALTHCHECK --interval=15s --timeout=10s --start-period=30s --retries=4 \
    CMD supervisorctl -s unix:///tmp/supervisor.sock status rag-api | grep -q RUNNING \
    && supervisorctl -s unix:///tmp/supervisor.sock status rag-worker | grep -q RUNNING \
    && curl -fsS http://127.0.0.1:5055/readyz >/dev/null

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
