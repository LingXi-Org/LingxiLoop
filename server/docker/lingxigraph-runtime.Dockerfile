# lingxigraph-runtime — standalone, stateless HTTP runtime for LingxiGraph
# reasoning.
#
# This container owns nothing but `/v1/turn`: one JSON request in, one
# structured `actions[]` result out. It never touches LingxiLoop's Postgres,
# Redis, or WebSocket state, and never executes an action itself — that
# stays on the LingxiLoop side.
#
# Build (from repo root):
#   docker build \
#     -f server/docker/lingxigraph-runtime.Dockerfile \
#     -t quay.io/yetoneful/lingxigraph-runtime:dev \
#     .

FROM python:3.12-slim-bookworm

# curl — used by the container HEALTHCHECK below.
# ca-certificates — TLS to the configured OpenAI-compatible provider.
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       curl \
       ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/lingxigraph/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY server/lingxigraph/lingxigraph_runner.py server/lingxigraph/server.py ./

# Env contract:
#   OPENAI_API_KEY                       required — the reasoning provider's key
#   OPENAI_BASE_URL                      optional — defaults to api.openai.com
#   LINGXIGRAPH_MODEL_TIMEOUT_SECONDS    optional — per-model-call timeout
#   LINGXIGRAPH_TOKEN                    optional — if set, /v1/turn requires
#                                         `Authorization: Bearer <token>`
#   PORT                                 optional — HTTP listen port
ENV LINGXIGRAPH_MODEL_TIMEOUT_SECONDS=90 \
    PORT=8124

EXPOSE 8124

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT}/health" || exit 1

CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
