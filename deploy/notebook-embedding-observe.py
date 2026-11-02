"""Bounded metadata SELECTs under the running Notebook's existing identity.

No startup resolver, activation, writes, vectors, original content or provider
calls. --details also describes the retained control index independently.
"""
import asyncio
import json
import os
import re
import sys
from urllib.parse import urlsplit
from surrealdb import RecordID

from open_notebook.rag.shadow import GENERATION, POINTER, Store, environment_store


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,95}", value):
        raise ValueError("Invalid database identity")
    return value


def model(value):
    if value is None:
        return None
    if isinstance(value, RecordID):
        value = str(value)
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9:/_.+-]{0,255}", value) or value.startswith("sk-"):
        raise ValueError("Invalid model metadata")
    return value


def endpoint(value):
    if value is None:
        return None
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError("Invalid endpoint metadata")
    url = urlsplit(value)
    if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password or url.query or url.fragment:
        raise ValueError("Unsafe endpoint metadata")
    return value


def number(value):
    return value if type(value) is int and 0 <= value <= 9007199254740991 else None


def generation(row):
    if not row:
        return None
    phases = {"active", "verified", "backfilling", "fenced", "activating", "aborted", "preparing"}
    result = {"phase": row.get("phase") if row.get("phase") in phases else "unknown"}
    for key in ("plan_sha256", "verification_sha256", "product_gate_sha256"):
        value = row.get(key)
        result[key] = value if isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value) else None
    return result


def pointer_view(row):
    if not row:
        return None
    return {**generation(row), "active_database": identifier(row["active_database"]),
            "revision": number(row.get("revision")), "model": model(row.get("model")),
            "base_url": endpoint(row.get("base_url"))}


async def snapshot(store):
    contracts = await store.rows("SELECT model,model_id,base_url,dimensions FROM open_notebook:rag_embedding_contract;")
    schemas = await store.rows("SELECT version FROM open_notebook:rag_schema;")
    chunks = await store.rows("SELECT count() AS n FROM source_embedding GROUP ALL;")
    invalid = await store.rows("SELECT count() AS n FROM source_embedding WHERE array::len(embedding) != 1024 GROUP ALL;")
    sample = await store.rows("SELECT array::len(embedding) AS dimensions FROM source_embedding LIMIT 1;")
    markers = await store.rows(f"SELECT phase,plan_sha256,verification_sha256,product_gate_sha256 FROM {GENERATION};")
    if len(contracts) > 1 or len(schemas) > 1 or len(markers) > 1:
        raise ValueError("Ambiguous Notebook metadata")
    contract = contracts[0] if contracts else None
    return {
        "database": identifier(store.database), "schemaVersion": number(schemas[0].get("version")) if schemas else None,
        "contract": {"model": model(contract.get("model")), "model_id": model(contract.get("model_id")),
                     "base_url": endpoint(contract.get("base_url")), "dimensions": number(contract.get("dimensions"))} if contract else None,
        "chunks": number(chunks[0].get("n")) if chunks else 0,
        "invalidDimensions": number(invalid[0].get("n")) if invalid else 0,
        "expectedDimensions": 1024,
        "sampledDimensions": number(sample[0].get("dimensions")) if sample else None,
        "generation": generation(markers[0]) if markers else None,
    }


async def observe_detailed():
    namespace = identifier(os.environ.get("SURREAL_NAMESPACE", "open_notebook"))
    database = identifier(os.environ.get("OPEN_NOTEBOOK_GENERATION_CONTROL_DATABASE") or os.environ.get("SURREAL_DATABASE", "open_notebook"))
    control = environment_store(namespace, database)
    query = f"SELECT phase,active_database,revision,model,base_url,plan_sha256,verification_sha256,product_gate_sha256 FROM {POINTER};"
    pointers = await control.rows(query)
    if len(pointers) > 1:
        raise ValueError("Ambiguous Notebook generation")
    pointer = pointer_view(pointers[0]) if pointers else None
    retained = await snapshot(control)
    active = retained
    if pointer and pointer["active_database"] != control.database:
        target = Store(control.url, control.user, control.password, namespace, pointer["active_database"])
        active = await snapshot(target)
    after = await control.rows(query)
    if len(after) > 1:
        raise ValueError("Ambiguous Notebook generation")
    return {
        "format": "notebook-readonly-observation/v1", "observationOnly": True, "status": "observed",
        "configurationScope": "container_environment_not_resolved_process_environment",
        "configured": {"model": model(os.environ.get("OPENAI_EMBEDDING_MODEL")), "base_url": endpoint(os.environ.get("OPENAI_BASE_URL"))},
        "control": retained, "active": active, "pointer": pointer,
        "pointerStable": pointer == (pointer_view(after[0]) if after else None),
        "consistency": "independent_metadata_reads_not_a_migration_or_compatibility_receipt",
    }


async def observe():
    detailed = await observe_detailed()
    if not detailed["pointerStable"]:
        raise ValueError("Notebook generation changed during observation")
    active = detailed["active"]
    return {**active, "pointer": detailed["pointer"]}


if __name__ == "__main__":
    try:
        if sys.argv[1:] not in ([], ["--details"]):
            raise ValueError("Invalid observer arguments")
        operation = observe_detailed() if sys.argv[1:] else observe()
        print(json.dumps(asyncio.run(asyncio.wait_for(operation, timeout=30))))
    except Exception:
        raise SystemExit("Notebook contract observation failed; no configuration or corpus was changed")
