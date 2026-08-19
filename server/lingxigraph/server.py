"""Stateless HTTP runtime for LingxiGraph.

Exposes:
  GET  /health   — liveness/readiness probe for the container healthcheck.
  POST /v1/turn  — one reasoning turn; request/response schema matches the
                   `LingxiGraphRunRequest` / `LingxiGraphRunResult` contract
                   used by the LingxiLoop Node adapter.

This process only reasons. It never touches LingxiLoop's Postgres, Redis, or
WebSocket state, and never executes an action itself — the caller does that
after receiving `actions[]`.
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI, Request
import json

from fastapi.responses import JSONResponse, StreamingResponse

from lingxigraph_runner import _run, _run_stream

app = FastAPI(title="lingxigraph-runtime")

RUNTIME_TOKEN = os.getenv("LINGXIGRAPH_TOKEN", "").strip()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/turn")
async def turn(request: Request) -> JSONResponse:
    if RUNTIME_TOKEN:
        expected = f"Bearer {RUNTIME_TOKEN}"
        if request.headers.get("authorization") != expected:
            return JSONResponse({"error": "unauthorized"}, status_code=401)

    try:
        body: Any = await request.json()
    except Exception as exc:
        return JSONResponse({"error": f"invalid JSON body: {exc}"}, status_code=400)

    try:
        result = await _run(body)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except Exception as exc:  # model/provider failure, etc.
        return JSONResponse({"error": f"{type(exc).__name__}: {exc}"}, status_code=502)

    return JSONResponse(result)


@app.post('/v1/turn/stream', response_model=None)
async def turn_stream(request: Request):
    if RUNTIME_TOKEN and request.headers.get('authorization') != f'Bearer {RUNTIME_TOKEN}':
        return JSONResponse({'error': 'unauthorized'}, status_code=401)
    try:
        body: Any = await request.json()
    except Exception as exc:
        return JSONResponse({'error': f'invalid JSON body: {exc}'}, status_code=400)

    async def events():
        try:
            async for event in _run_stream(body):
                yield json.dumps(event, ensure_ascii=False, separators=(',', ':')) + '\n'
        except Exception as exc:
            yield json.dumps({'type': 'error', 'error': f'{type(exc).__name__}: {exc}'}, ensure_ascii=False) + '\n'

    return StreamingResponse(events(), media_type='application/x-ndjson')
