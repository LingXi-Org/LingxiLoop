"""Resolve one active database/model for both RAG processes before launch."""

import asyncio
import os
import re
import sys
from collections.abc import Mapping

from open_notebook.rag.shadow import (
    GENERATION,
    MANAGED_RECORD,
    MODEL,
    POINTER,
    Store,
    environment_store,
    require,
)

CONTROL = "OPEN_NOTEBOOK_GENERATION_CONTROL_DATABASE"
REVISION = "OPEN_NOTEBOOK_GENERATION_REVISION"
MANAGED = "OPEN_NOTEBOOK_GENERATION_MANAGED"


def _store(environment: Mapping[str, str]) -> Store:
    return environment_store(
        environment.get("SURREAL_NAMESPACE", "open_notebook"),
        environment.get(CONTROL)
        or environment.get("SURREAL_DATABASE", "open_notebook"),
    )


async def _pointer(store: Store) -> dict | None:
    rows = await store.rows(f"SELECT * FROM {POINTER};")
    require(len(rows) <= 1, "Ambiguous active generation")
    if not rows:
        managed = await store.rows(f"SELECT * FROM {MANAGED_RECORD};")
        require(not managed, "Managed generation pointer disappeared")
    return rows[0] if rows else None


async def resolve_environment(
    environment: Mapping[str, str], store: Store | None = None
) -> dict[str, str]:
    store = store or _store(environment)
    # A mistaken target-database environment must not start an unfenced legacy
    # reader. The target manifest identifies its retained control database.
    shadow = await store.rows(f"SELECT * FROM {GENERATION};")
    if shadow:
        marker = shadow[0]
        control = marker.get("control_database", "")
        require(
            marker.get("target_database") == store.database
            and marker.get("namespace") == store.namespace
            and re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,95}", control)
            and control != store.database,
            "Invalid shadow control database",
        )
        store = Store(store.url, store.user, store.password, store.namespace, control)
    pointer = await _pointer(store)
    result = dict(environment)
    result[CONTROL] = store.database
    result[REVISION] = "0"
    result[MANAGED] = "0"
    if not pointer:
        return result
    require(pointer.get("phase") == "active", "Knowledge generation is fenced")
    database = pointer.get("active_database", "")
    require(
        bool(re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,95}", database))
        and type(pointer.get("revision")) is int
        and pointer["revision"] >= 0,
        "Invalid active generation identity",
    )
    result["SURREAL_DATABASE"] = database
    result[REVISION] = str(pointer["revision"])
    result[MANAGED] = "1"
    if database != store.database:
        base = environment.get("OPENAI_BASE_URL", "").rstrip("/")
        # This is one existing authenticated origin, never an arbitrary endpoint.
        require(
            pointer.get("model") == MODEL
            and pointer.get("base_url") in {base, base + "/shadow"}
            and base.endswith("/internal/open-notebook/v1")
            and all(
                re.fullmatch(r"[a-f0-9]{64}", pointer.get(key, ""))
                for key in ("plan_sha256", "verification_sha256", "product_gate_sha256")
            ),
            "Invalid active Pro generation contract",
        )
        result["OPENAI_EMBEDDING_MODEL"] = MODEL
        result["OPENAI_BASE_URL"] = pointer["base_url"]
        target = Store(store.url, store.user, store.password, store.namespace, database)
        marker = await target.rows(f"SELECT * FROM {GENERATION};")
        require(
            len(marker) == 1
            and marker[0].get("phase") in {"verified", "active"}
            and marker[0].get("plan_sha256") == pointer["plan_sha256"]
            and marker[0].get("verification_sha256") == pointer["verification_sha256"],
            "Target is not sealed by the active pointer",
        )
        if marker[0]["phase"] == "verified":
            opened = await target.rows(
                f"""
                UPDATE {GENERATION} SET phase='active'
                WHERE phase='verified' AND plan_sha256=$plan AND verification_sha256=$verification RETURN AFTER;
            """,
                {
                    "plan": pointer["plan_sha256"],
                    "verification": pointer["verification_sha256"],
                },
            )
            require(len(opened) == 1, "Target activation outcome requires inspection")
    return result


async def generation_status(
    environment: Mapping[str, str] | None = None, store: Store | None = None
) -> dict | None:
    environment = environment if environment is not None else os.environ
    store = store or _store(environment)
    pointer = await _pointer(store)
    if not pointer:
        require(
            environment.get(MANAGED, "0") == "0",
            "Managed generation pointer disappeared",
        )
        return None
    require(pointer.get("phase") == "active", "Knowledge generation is fenced")
    require(
        pointer.get("active_database")
        == environment.get("SURREAL_DATABASE", "open_notebook")
        and str(pointer.get("revision")) == environment.get(REVISION, "0"),
        "Knowledge process has a stale generation",
    )
    if pointer["active_database"] != store.database:
        require(
            pointer.get("model") == environment.get("OPENAI_EMBEDDING_MODEL") == MODEL
            and pointer.get("base_url") == environment.get("OPENAI_BASE_URL"),
            "Knowledge process model/endpoint differs from active generation",
        )
    return {
        key: pointer.get(key)
        for key in (
            "active_database",
            "revision",
            "plan_sha256",
            "verification_sha256",
            "model",
            "base_url",
            "product_gate_sha256",
        )
    }


def main() -> None:
    require(len(sys.argv) > 1, "A RAG process command is required")
    resolved = asyncio.run(resolve_environment(os.environ))
    os.execvpe(sys.argv[1], sys.argv[1:], resolved)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        raise SystemExit(
            "RAG startup refused: inspect the active generation and fence; no credentials or corpus were printed."
        )
