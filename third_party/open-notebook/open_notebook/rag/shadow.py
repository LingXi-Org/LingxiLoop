"""Finite, fenced, resumable RAG embedding-generation migration.

This is an operator entrypoint, never an HTTP tool. It does not delete a
database, modify an old embedding, re-extract content or replay a paid call.
"""

import argparse
import asyncio
import hashlib
import json
import math
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Awaitable, Callable
from urllib.parse import urlsplit

import httpx
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from surrealdb import AsyncSurreal, RecordID

MODEL = "Pro/BAAI/bge-m3"
DIMENSIONS = 1024
CNY_PER_TOKEN = Decimal("0.000070") / 1000
POINTER = "open_notebook:rag_active_generation"
GENERATION = "open_notebook:rag_shadow_generation"
MANAGED_RECORD = "open_notebook:rag_generation_managed"
TABLES = (
    "notebook",
    "source",
    "reference",
    "source_embedding",
    "command",
    "open_notebook",
)
TERMINAL = {"completed", "failed", "canceled"}
PRODUCT_LOCK_TABLES = (
    "knowledge_source_jobs",
    "knowledge_sources",
    "knowledge_notebook_bindings",
    "organization_case_notebooks",
    "organization_cases",
    "projects",
)


class ShadowError(ValueError):
    """A fixed, secret-free operator diagnostic."""


def _json(value: Any) -> Any:
    if isinstance(value, (RecordID, datetime, Decimal)):
        return str(value)
    raise TypeError("Unsupported manifest value")


def digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(
            value,
            default=_json,
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        ).encode()
    ).hexdigest()


def seal(value: dict) -> dict:
    return {**value, "sha256": digest(value)}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ShadowError(message)


def _event_when(table: str) -> str:
    if table != "open_notebook":
        return "true"
    return "($after.id INSIDE [open_notebook:rag_schema,open_notebook:rag_embedding_contract] OR $before.id INSIDE [open_notebook:rag_schema,open_notebook:rag_embedding_contract])"


def _source_event(table: str, database: str) -> str:
    return f"""DEFINE EVENT rag_generation_fence ON {table} WHEN {_event_when(table)} THEN {{
        LET $gate=(SELECT * FROM {POINTER})[0];
        IF $gate = NONE OR $gate.phase != 'active' OR $gate.active_database != '{database}' {{
          THROW 'RAG_GENERATION_WRITE_FENCED';
        }};
    }};"""


def _target_event(table: str) -> str:
    return f"""DEFINE EVENT rag_shadow_fence ON {table} WHEN {_event_when(table)} THEN {{
        LET $gate=(SELECT * FROM {GENERATION})[0];
        IF $gate = NONE OR $gate.phase = 'verified' OR
          ($gate.phase != 'active' AND ($gate.phase != 'backfilling' OR $rag_shadow_plan != $gate.plan_sha256)) {{
          THROW 'RAG_SHADOW_WRITE_FENCED';
        }};
    }};"""


def _normalized_event(value: str) -> str:
    # Identifiers and string literals here contain no whitespace. Compare the
    # fixed server-canonical definition, preserving every token and operator.
    pieces = re.split(
        r"('(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\")", value.replace(" ON TABLE ", " ON ")
    )
    return "".join(
        piece if i % 2 else re.sub(r"\s+", "", piece) for i, piece in enumerate(pieces)
    ).rstrip(";")


async def _events(
    store: "Store", *, target: bool = False, allow_missing: bool = False
) -> str:
    missing = []
    name = "rag_shadow_fence" if target else "rag_generation_fence"
    for table in TABLES:
        info = (await store.run(f"INFO FOR TABLE {table};"))[0]
        actual = info.get("events", {}).get(name)
        expected = (
            _target_event(table) if target else _source_event(table, store.database)
        )
        if actual is None and allow_missing:
            missing.append(expected)
        else:
            require(
                isinstance(actual, str)
                and _normalized_event(actual) == _normalized_event(expected),
                "Database fence event is missing or changed",
            )
    return "\n".join(missing)


class SourceBinding(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    source_id: str
    company_id: str
    notebook_ids: list[str] = Field(max_length=1000)


class Scope(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    migration_id: str
    namespace: str
    source_database: str
    target_database: str
    company_ids: list[str] = Field(min_length=1, max_length=1000)
    source_ids: list[str] = Field(max_length=1000)
    notebook_ids: list[str] = Field(max_length=1000)
    max_notebooks: int = Field(ge=0, le=1000)
    binding_manifest_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    authoritative_bindings: list[SourceBinding] = Field(max_length=1000)
    product_lock_relations: list[str] = Field(
        default_factory=lambda: list(PRODUCT_LOCK_TABLES), max_length=10
    )
    max_sources: int = Field(ge=0, le=1000)
    max_chunks: int = Field(ge=0, le=512)
    max_references: int = Field(default=4096, ge=0, le=4096)
    max_manifest_bytes: int = Field(default=16000000, ge=1, le=32000000)
    max_input_tokens: int = Field(ge=1, le=1000000000)
    max_cost_cny: Decimal = Field(gt=0, le=10000)
    target_base_url: str

    @field_validator("migration_id", "namespace", "source_database", "target_database")
    @classmethod
    def identifier(cls, value: str) -> str:
        require(
            bool(re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,95}", value)),
            "Invalid resource identity",
        )
        return value

    @model_validator(mode="after")
    def valid(self):
        require(
            self.source_database != self.target_database,
            "Source and target database must differ",
        )
        require(
            len(set(self.company_ids)) == len(self.company_ids)
            and all(self.company_ids),
            "Invalid company scope",
        )
        require(
            len(set(self.source_ids)) == len(self.source_ids), "Duplicate source scope"
        )
        require(
            all(
                str(RecordID.parse(value)) == value and value.startswith("source:")
                for value in self.source_ids
            ),
            "Invalid source scope",
        )
        require(len(self.source_ids) <= self.max_sources, "Source scope exceeds budget")
        require(
            len(set(self.notebook_ids)) == len(self.notebook_ids)
            and len(self.notebook_ids) <= self.max_notebooks
            and all(
                str(RecordID.parse(value)) == value and value.startswith("notebook:")
                for value in self.notebook_ids
            ),
            "Invalid notebook scope",
        )
        require(
            len(self.authoritative_bindings) == len(self.source_ids)
            and {row.source_id for row in self.authoritative_bindings}
            == set(self.source_ids)
            and all(
                row.company_id in self.company_ids
                and len(set(row.notebook_ids)) == len(row.notebook_ids)
                and set(row.notebook_ids).issubset(self.notebook_ids)
                for row in self.authoritative_bindings
            ),
            "Invalid authoritative source bindings",
        )
        require(
            len(set(self.product_lock_relations)) == len(self.product_lock_relations)
            and set(PRODUCT_LOCK_TABLES).issubset(self.product_lock_relations)
            and set(self.product_lock_relations).issubset(
                set(PRODUCT_LOCK_TABLES)
                | {
                    "conversations",
                    "conversation_source_exclusions",
                    "uploaded_files",
                    "organization_case_images",
                }
            ),
            "Unreviewed product lock scope",
        )
        url = urlsplit(self.target_base_url)
        require(
            url.scheme == "https"
            and bool(url.hostname)
            and not url.username
            and not url.password
            and not url.query
            and not url.fragment
            and url.path.endswith("/internal/open-notebook/v1/shadow"),
            "Invalid Pro-only proxy endpoint",
        )
        return self


class Store:
    def __init__(
        self, url: str, user: str, password: str, namespace: str, database: str
    ):
        self.url, self.user, self.password = url, user, password
        self.namespace, self.database = namespace, database
        self.migration_plan: str | None = None

    @asynccontextmanager
    async def connection(self):
        db = AsyncSurreal(self.url)
        try:
            await db.signin({"username": self.user, "password": self.password})
            await db.use(self.namespace, self.database)
            yield db
        finally:
            await db.close()

    async def run(self, query: str, variables: dict | None = None) -> list:
        async with self.connection() as db:
            result = await db.query_raw(
                query, {**(variables or {}), "rag_shadow_plan": self.migration_plan}
            )
        require(
            isinstance(result, dict) and isinstance(result.get("result"), list),
            "Invalid database response",
        )
        results = result["result"]
        if result.get("error") or any(row.get("status") != "OK" for row in results):
            # Query diagnostics may contain source text or credentials. Do not emit them.
            raise RuntimeError(
                "RAG database operation failed; transaction outcome requires inspection"
            )
        return [row.get("result") for row in results]

    async def rows(self, query: str, variables: dict | None = None) -> list:
        results = await self.run(query, variables)
        require(
            len(results) == 1 and isinstance(results[0], list),
            "Invalid database row response",
        )
        return results[0]


def _stable(row: dict) -> dict:
    return {
        key: value
        for key, value in row.items()
        if key not in {"created", "updated", "last_viewed_at"}
    }


def _compared(table: str, row: dict) -> dict:
    return {
        key: value
        for key, value in row.items()
        if value is not None
        and (key != "updated" or table not in {"source", "notebook"})
    }


def _target_row(table: str, row: dict) -> dict:
    result = _compared(table, row)
    if table == "source" and isinstance(result.get("asset"), dict):
        result["asset"] = {**result["asset"], "owned": False}
    if table == "command":
        result = {
            key: value
            for key, value in result.items()
            if key
            in {"id", "app", "name", "status", "error_message", "created", "updated"}
        }
        # Preserve status and completion receipts, never job arguments/context.
        original = row.get("result")
        if isinstance(original, dict):
            result["result"] = {
                key: value
                for key, value in original.items()
                if key in {"success", "source_id", "embedded_chunks", "processing_time"}
            }
    return result


def _token_bound(chunks: list[dict]) -> int:
    # An intentionally conservative byte bound, not an invented measured usage.
    return sum(len(row["content"].encode("utf-8")) + 64 for row in chunks)


def _vectors(
    payload: dict, count: int, token_bound: int
) -> tuple[list[list[float]], int]:
    require(
        payload.get("model") == MODEL,
        "Returned embedding model differs from Pro contract",
    )
    tokens = payload.get("usage", {}).get("prompt_tokens")
    require(
        type(tokens) is int and 0 < tokens <= token_bound,
        "Invalid measured input usage",
    )
    rows = payload.get("data")
    require(isinstance(rows, list) and len(rows) == count, "Embedding count mismatch")
    require(
        all(isinstance(row, dict) and type(row.get("index")) is int for row in rows),
        "Invalid embedding indices",
    )
    require(
        sorted(row["index"] for row in rows) == list(range(count)),
        "Duplicate or missing embedding indices",
    )
    vectors = [
        row.get("embedding") for row in sorted(rows, key=lambda row: row["index"])
    ]
    for vector in vectors:
        require(
            isinstance(vector, list) and len(vector) == DIMENSIONS,
            "Invalid embedding dimensions",
        )
        require(
            all(type(v) in {int, float} and math.isfinite(v) for v in vector)
            and math.isfinite(sum(v * v for v in vector))
            and sum(v * v for v in vector) > 0,
            "Invalid nonfinite or zero embedding",
        )
    return [[float(value) for value in vector] for vector in vectors], tokens


class ShadowMigration:
    def __init__(
        self,
        scope: Scope,
        source: Store,
        target: Store,
        embed: Callable[[list[str], str, str], Awaitable[dict]],
    ):
        self.scope, self.source, self.target, self.embed = scope, source, target, embed
        require(
            source.namespace == scope.namespace == target.namespace
            and source.database == scope.source_database
            and target.database == scope.target_database
            and source.url == target.url,
            "Database identity differs from scope",
        )

    async def pointer(self) -> dict | None:
        rows = await self.source.rows(f"SELECT * FROM {POINTER};")
        require(len(rows) <= 1, "Ambiguous generation pointer")
        if not rows:
            managed = await self.source.rows(f"SELECT * FROM {MANAGED_RECORD};")
            require(not managed, "Managed source pointer disappeared")
        return rows[0] if rows else None

    async def snapshot(self) -> dict:
        # Only IDs are read before proving the finite, complete approved scope.
        ids = await self.source.rows(
            "SELECT id,company_id,command FROM source ORDER BY id;"
        )
        require(
            {str(row["id"]) for row in ids} == set(self.scope.source_ids)
            and all(row.get("company_id") in self.scope.company_ids for row in ids),
            "Approved scope does not cover the entire active database",
        )
        notebooks = await self.source.rows("SELECT id FROM notebook ORDER BY id;")
        require(
            {str(row["id"]) for row in notebooks} == set(self.scope.notebook_ids),
            "Approved notebook scope does not cover the entire active database",
        )
        # Bound the actual data before materializing text or 1024-D vectors in
        # the 768 MiB production knowledge container. Larger corpora need a
        # separate paginated migration, not a larger unchecked CLI limit.
        chunk_count = await self.source.rows(
            "SELECT count() AS count FROM source_embedding GROUP ALL;"
        )
        reference_count = await self.source.rows(
            "SELECT count() AS count FROM reference GROUP ALL;"
        )
        require(
            (not chunk_count or chunk_count[0]["count"] <= self.scope.max_chunks)
            and (
                not reference_count
                or reference_count[0]["count"] <= self.scope.max_references
            ),
            "Corpus exceeds bounded manifest budget",
        )
        lengths = await self.source.rows(
            "SELECT string::len(content) AS length,array::len(embedding) AS dimensions FROM source_embedding;"
        )
        require(
            all(row.get("dimensions") == DIMENSIONS for row in lengths),
            "Old vector dimensions differ from contract",
        )
        manifest_chars = sum(row.get("length") or 0 for row in lengths)
        for table in ("source", "notebook", "reference"):
            sizes = await self.source.rows(
                f"SELECT string::len(type::string($this)) AS length FROM {table};"
            )
            manifest_chars += sum(row.get("length") or 0 for row in sizes)
        command_sizes = await self.source.rows(
            "SELECT string::len(type::string($this)) AS length FROM command WHERE id IN $commands;",
            {"commands": [row.get("command") for row in ids]},
        )
        manifest_chars += sum(row.get("length") or 0 for row in command_sizes)
        require(
            4 * manifest_chars <= self.scope.max_manifest_bytes,
            "Corpus exceeds bounded manifest byte budget",
        )
        pending = await self.source.rows(
            "SELECT count() AS count FROM command WHERE status NOT IN ['completed','failed','canceled'] GROUP ALL;"
        )
        require(
            not pending or pending[0].get("count") == 0,
            "Unsettled command blocks migration",
        )
        results = await self.source.run(
            """
          BEGIN TRANSACTION;
          RETURN {schema:(SELECT * FROM open_notebook:rag_schema),
            contract:(SELECT * FROM open_notebook:rag_embedding_contract),
            notebooks:(SELECT * FROM notebook ORDER BY id),
            sources:(SELECT * FROM source ORDER BY id),
            references:(SELECT * FROM reference ORDER BY id),
            chunks:(SELECT * FROM source_embedding ORDER BY id),
            pending:(SELECT count() AS count FROM command WHERE status NOT IN ['completed','failed','canceled'] GROUP ALL),
            commands:(SELECT id,app,name,status,result,error_message,created,updated FROM command WHERE id IN $commands ORDER BY id)};
          COMMIT TRANSACTION;
        """,
            {"commands": [row.get("command") for row in ids]},
        )
        data = next(
            (row for row in results if isinstance(row, dict) and "sources" in row), None
        )
        require(data is not None, "Snapshot transaction returned no manifest")
        require(
            not data["pending"] or data["pending"][0].get("count") == 0,
            "Unsettled command blocks migration",
        )
        data.pop("pending")
        require(
            len(data["schema"]) == 1 and data["schema"][0].get("version") == 1,
            "Unexpected RAG schema",
        )
        require(len(data["contract"]) == 1, "Missing source embedding contract")
        contract = data["contract"][0]
        require(
            contract.get("model") == contract.get("model_id")
            and contract.get("dimensions") == DIMENSIONS
            and bool(contract.get("base_url")),
            "Invalid source model contract",
        )
        require(
            {str(row["id"]) for row in data["sources"]} == set(self.scope.source_ids)
            and all(
                row.get("company_id") in self.scope.company_ids
                for row in data["sources"]
            ),
            "Snapshot scope changed",
        )
        source_ids = {str(row["id"]) for row in data["sources"]}
        notebook_ids = {str(row["id"]) for row in data["notebooks"]}
        require(notebook_ids == set(self.scope.notebook_ids), "Notebook scope changed")
        require(
            all(row.get("external_key") for row in data["notebooks"]),
            "Notebook identity missing",
        )
        require(
            all(
                str(row.get("in")) in source_ids and str(row.get("out")) in notebook_ids
                for row in data["references"]
            ),
            "Reference closure is incomplete",
        )
        for binding in self.scope.authoritative_bindings:
            source = next(
                row for row in data["sources"] if str(row["id"]) == binding.source_id
            )
            actual_notebooks = [
                str(row["out"])
                for row in data["references"]
                if str(row["in"]) == binding.source_id
            ]
            require(
                source.get("company_id") == binding.company_id
                and len(actual_notebooks) == len(binding.notebook_ids)
                and set(actual_notebooks) == set(binding.notebook_ids),
                "RAG references differ from authoritative product bindings",
            )
        require(
            all(
                str(row.get("source")) in source_ids
                and type(row.get("order")) is int
                and isinstance(row.get("content"), str)
                and row["content"].strip()
                for row in data["chunks"]
            ),
            "Chunk closure or content is invalid",
        )
        require(
            all(row.get("status") in TERMINAL for row in data["commands"]),
            "Unsettled command blocks migration",
        )
        command_map = {str(row["id"]): row for row in data["commands"]}
        referenced_commands = set()
        for source in data["sources"]:
            command_id = str(source.get("command"))
            require(
                command_id in command_map
                and not source.get("rag_state")
                and bool(source.get("external_key"))
                and bool(source.get("ingestion_fingerprint")),
                "Invalid source command or version",
            )
            command = command_map[command_id]
            require(
                command.get("app") == "open_notebook"
                and command.get("name") == "process_source",
                "Unknown source command",
            )
            referenced_commands.add(command_id)
            chunks = [
                row for row in data["chunks"] if str(row["source"]) == str(source["id"])
            ]
            require(
                len({row["order"] for row in chunks}) == len(chunks),
                "Duplicate chunk order",
            )
            require(
                all(
                    len(
                        json.dumps(
                            [row["content"] for row in chunks[offset : offset + 50]],
                            ensure_ascii=False,
                        ).encode()
                    )
                    <= 1000000
                    for offset in range(0, len(chunks), 50)
                ),
                "Corpus batch exceeds authenticated proxy request limit",
            )
            if command["status"] == "completed":
                require(bool(chunks), "Completed source has no chunks")
        data["commands"] = [
            row for row in data["commands"] if str(row["id"]) in referenced_commands
        ]
        require(
            len(data["sources"]) <= self.scope.max_sources
            and len(data["chunks"]) <= self.scope.max_chunks,
            "Corpus exceeds approved budget",
        )
        bound = _token_bound(data["chunks"])
        require(
            bound <= self.scope.max_input_tokens
            and Decimal(bound) * CNY_PER_TOKEN <= self.scope.max_cost_cny,
            "Corpus exceeds approved token/cost budget",
        )
        return data

    @staticmethod
    def counts(data: dict) -> dict:
        return {
            key: len(data[key])
            for key in ("sources", "notebooks", "references", "chunks", "commands")
        }

    async def plan(self) -> dict:
        pointer = await self.pointer()
        require(
            pointer is None
            or (
                pointer.get("phase") == "active"
                and pointer.get("active_database") == self.scope.source_database
            ),
            "Source generation is not active",
        )
        data = await self.snapshot()
        return seal(
            {
                "format": "rag-shadow-plan/v1",
                "migration_id": self.scope.migration_id,
                "namespace": self.scope.namespace,
                "source_database": self.scope.source_database,
                "target_database": self.scope.target_database,
                "target_model": MODEL,
                "binding_manifest_sha256": self.scope.binding_manifest_sha256,
                "product_lock_relations": sorted(self.scope.product_lock_relations),
                "lock_scope_sha256": digest(sorted(self.scope.product_lock_relations)),
                "scope_sha256": digest(self.scope.model_dump()),
                "source_sha256": digest(data),
                "source_vectors_sha256": digest(data["chunks"]),
                "source_contract_sha256": digest(_stable(data["contract"][0])),
                "counts": self.counts(data),
                "reserved_input_tokens": _token_bound(data["chunks"]),
                "reserved_cost_cny": str(
                    Decimal(_token_bound(data["chunks"])) * CNY_PER_TOKEN
                ),
                "source_revision": pointer["revision"] if pointer else 0,
            }
        )

    def check_plan(self, plan: dict) -> None:
        require(
            plan.get("format") == "rag-shadow-plan/v1"
            and plan.get("sha256")
            == digest({k: v for k, v in plan.items() if k != "sha256"})
            and plan.get("scope_sha256") == digest(self.scope.model_dump()),
            "Plan or approved scope changed",
        )

    async def _frozen(self, plan: dict, *, activating: bool = False) -> dict:
        self.check_plan(plan)
        pointer = await self.pointer()
        require(
            pointer is not None
            and pointer.get("phase") == ("activating" if activating else "fenced")
            and pointer.get("active_database")
            == (
                self.scope.target_database if activating else self.scope.source_database
            )
            and pointer.get("revision") == plan["source_revision"] + int(activating)
            and pointer.get("plan_sha256") == plan["sha256"],
            "Source fence/pointer changed",
        )
        await _events(self.source)
        data = await self.snapshot()
        require(
            digest(data) == plan["source_sha256"], "Frozen source watermark changed"
        )
        return data

    async def fence(self, plan: dict) -> dict:
        self.check_plan(plan)
        pointer = await self.pointer()
        if pointer and pointer.get("phase") == "fenced":
            await self._frozen(plan)
            return self._fence_receipt(pointer, plan)
        # Events are transactional and stop late or previously admitted writers.
        guards = await _events(self.source, allow_missing=True)
        await self.source.run(
            f"""
          BEGIN TRANSACTION;
          LET $gate = (SELECT * FROM {POINTER})[0];
          IF $gate != NONE AND ($gate.phase != 'active' OR $gate.active_database != $source_database OR $gate.revision != $revision) {{
            THROW 'RAG_GENERATION_CAS_FAILED';
          }};
          IF array::len(SELECT id FROM command WHERE status NOT IN ['completed','failed','canceled']) > 0 {{
            THROW 'RAG_UNSETTLED_COMMAND';
          }};
          {guards}
          UPSERT {MANAGED_RECORD} SET control_database=$source_database;
          UPSERT {POINTER} CONTENT $pointer;
          COMMIT TRANSACTION;
        """,
            {
                "source_database": self.scope.source_database,
                "revision": plan["source_revision"],
                "pointer": {
                    "phase": "fenced",
                    "active_database": self.scope.source_database,
                    "revision": plan["source_revision"],
                    "plan_sha256": plan["sha256"],
                    "migration_id": self.scope.migration_id,
                },
            },
        )
        # A concurrent edit before the fence is an explicit stopped state.
        await self._frozen(plan)
        return self._fence_receipt(await self.pointer(), plan)

    def _fence_receipt(self, pointer: dict, plan: dict) -> dict:
        return seal(
            {
                "format": "rag-shadow-fence/v1",
                "plan_sha256": plan["sha256"],
                "source_sha256": plan["source_sha256"],
                "migration_id": pointer["migration_id"],
                "active_database": pointer["active_database"],
                "revision": pointer["revision"],
                "source_database": self.scope.source_database,
                "target_database": self.scope.target_database,
                "phase": pointer["phase"],
                "counts": plan["counts"],
            }
        )

    async def status(self, plan: dict) -> dict:
        """Fresh read-only source fence/event/watermark proof for config guards."""
        await self._frozen(plan)
        return self._fence_receipt(await self.pointer(), plan)

    async def abort(self, plan: dict) -> dict:
        self.check_plan(plan)
        pointer = await self.pointer()
        require(
            pointer is not None
            and pointer.get("phase") in {"fenced", "activating"}
            and pointer.get("plan_sha256") == plan["sha256"],
            "Abort requires a known closed cutover",
        )
        if pointer["phase"] == "activating":
            target = await self.target.rows(f"SELECT * FROM {GENERATION};")
            require(
                len(target) == 1 and target[0].get("phase") == "verified",
                "Target may have opened; abort is forbidden",
            )
        rows = await self.source.rows(
            f"""
          UPDATE {POINTER} SET phase='active',active_database=$database,revision=revision+1
          WHERE phase=$phase AND plan_sha256=$plan
            AND revision=$revision RETURN AFTER;
        """,
            {
                "database": self.scope.source_database,
                "plan": plan["sha256"],
                "revision": pointer["revision"],
                "phase": pointer["phase"],
            },
        )
        require(len(rows) == 1, "Abort CAS failed; inspect the existing pointer")
        return {
            "aborted": True,
            "revision": rows[0]["revision"],
            "target_retained": True,
        }

    async def _prepare_target(self, plan: dict) -> None:
        self.target.migration_plan = plan["sha256"]
        marker = await self.target.rows(f"SELECT * FROM {GENERATION};")
        if marker:
            require(
                len(marker) == 1
                and marker[0].get("plan_sha256") == plan["sha256"]
                and marker[0].get("scope_sha256") == plan["scope_sha256"],
                "Target belongs to another manifest",
            )
            require(
                marker[0].get("phase") == "backfilling",
                "Target generation is sealed or already active",
            )
            return
        info = (await self.target.run("INFO FOR DB;"))[0]
        require(not info.get("tables"), "Target database is not empty")
        schema = Path(__file__).with_name("schema.surrealql").read_text()
        guards = "\n".join(_target_event(table) for table in TABLES)
        await self.target.run(
            f"""BEGIN TRANSACTION; {schema}
          CREATE {GENERATION} CONTENT $generation;
          CREATE open_notebook:rag_embedding_contract CONTENT $contract;
          {guards}
          COMMIT TRANSACTION;""",
            {
                "generation": {
                    "plan_sha256": plan["sha256"],
                    "scope_sha256": plan["scope_sha256"],
                    "source_sha256": plan["source_sha256"],
                    "phase": "backfilling",
                    "control_database": self.scope.source_database,
                    "target_database": self.scope.target_database,
                    "namespace": self.scope.namespace,
                },
                "contract": {
                    "model": MODEL,
                    "model_id": MODEL,
                    "dimensions": DIMENSIONS,
                    "base_url": self.scope.target_base_url,
                },
            },
        )

    async def _copy_rows(self, table: str, rows: list[dict]) -> None:
        for original in rows:
            expected = _target_row(table, original)
            existing = await self.target.rows(
                "SELECT * FROM $id;", {"id": original["id"]}
            )
            if existing:
                require(
                    len(existing) == 1 and _compared(table, existing[0]) == expected,
                    "Target row differs from manifest",
                )
                continue
            await self.target.run(
                "CREATE $id CONTENT $row;",
                {
                    "id": original["id"],
                    "row": {k: v for k, v in expected.items() if k != "id"},
                },
            )

    async def backfill(self, plan: dict) -> dict:
        data = await self._frozen(plan)
        await self._prepare_target(plan)
        requests = await self.target.rows("SELECT * FROM rag_shadow_request;")
        require(
            all(row.get("status") == "complete" for row in requests),
            "An unresolved/unknown paid request cannot be replayed",
        )
        expected_requests = {
            str(
                RecordID(
                    "rag_shadow_request",
                    digest({"source": str(source["id"]), "offset": offset}),
                )
            )
            for source in data["sources"]
            for offset in range(
                0,
                len([row for row in data["chunks"] if row["source"] == source["id"]]),
                50,
            )
        }
        require(
            all(str(row["id"]) in expected_requests for row in requests),
            "Unattributed target paid request",
        )
        for table, name in (("notebook", "notebooks"), ("command", "commands")):
            await self._copy_rows(table, data[name])
        for source in data["sources"]:
            chunks = [row for row in data["chunks"] if row["source"] == source["id"]]
            receipt_id = RecordID("rag_shadow_source", digest(str(source["id"])))
            completed = await self.target.rows("SELECT * FROM $id;", {"id": receipt_id})
            if completed:
                require(
                    completed[0].get("source_sha256") == digest(source),
                    "Completed target source changed",
                )
                continue
            new_chunks = []
            for offset in range(0, len(chunks), 50):
                batch = chunks[offset : offset + 50]
                request_id = RecordID(
                    "rag_shadow_request",
                    digest({"source": str(source["id"]), "offset": offset}),
                )
                bound = _token_bound(batch)
                content_hash = digest(
                    [
                        {k: v for k, v in row.items() if k != "embedding"}
                        for row in batch
                    ]
                )
                previous = next(
                    (row for row in requests if row["id"] == request_id), None
                )
                if previous:
                    require(
                        previous.get("plan_sha256") == plan["sha256"]
                        and previous.get("content_sha256") == content_hash
                        and previous.get("reserved_tokens") == bound
                        and len(previous.get("rows", [])) == len(batch),
                        "Stored paid response differs from manifest",
                    )
                    records = previous["rows"]
                    for row, original in zip(records, batch):
                        require(
                            {k: v for k, v in row.items() if k != "embedding"}
                            == {k: v for k, v in original.items() if k != "embedding"},
                            "Stored paid content differs",
                        )
                    _vectors(
                        {
                            "model": previous.get("model"),
                            "usage": {"prompt_tokens": previous.get("input_tokens")},
                            "data": [
                                {"index": i, "embedding": row["embedding"]}
                                for i, row in enumerate(records)
                            ],
                        },
                        len(batch),
                        bound,
                    )
                    new_chunks.extend(records)
                    continue
                # Durable reservation precedes the paid action. Never retry a lost response.
                await self.target.run(
                    "CREATE $id CONTENT $row;",
                    {
                        "id": request_id,
                        "row": {
                            "status": "pending",
                            "plan_sha256": plan["sha256"],
                            "reserved_tokens": bound,
                            "content_sha256": content_hash,
                        },
                    },
                )
                payload = await self.embed(
                    [row["content"] for row in batch],
                    source["company_id"],
                    digest({"plan": plan["sha256"], "request": str(request_id)}),
                )
                vectors, tokens = _vectors(payload, len(batch), bound)
                records = [
                    {**row, "embedding": vector} for row, vector in zip(batch, vectors)
                ]
                # Persist the measured receipt and response together; no plaintext in public receipts.
                await self.target.run(
                    "UPDATE $id SET status='complete',input_tokens=$tokens,model=$model,rows=$rows;",
                    {
                        "id": request_id,
                        "tokens": tokens,
                        "model": MODEL,
                        "rows": records,
                    },
                )
                new_chunks.extend(records)
            source_row = _target_row("source", source)
            source_refs = [
                row for row in data["references"] if row["in"] == source["id"]
            ]
            await self.target.run(
                """
              BEGIN TRANSACTION;
              CREATE $source_id CONTENT $source;
              FOR $row IN $chunks { CREATE $row.id CONTENT $row; };
              FOR $row IN $references {
                LET $src=$row.in; LET $edge=$row.id; LET $dst=$row.out;
                RELATE $src->$edge->$dst CONTENT $row;
              };
              CREATE $receipt_id CONTENT $receipt;
              COMMIT TRANSACTION;
            """,
                {
                    "source_id": source["id"],
                    "source": {k: v for k, v in source_row.items() if k != "id"},
                    "chunks": new_chunks,
                    "references": source_refs,
                    "receipt_id": receipt_id,
                    "receipt": {
                        "source_sha256": digest(source),
                        "vectors_sha256": digest(new_chunks),
                    },
                },
            )
        return await self.verify(plan)

    async def verify(self, plan: dict, *, activating: bool = False) -> dict:
        data = await self._frozen(plan, activating=activating)
        await _events(self.target, target=True)
        marker = await self.target.rows(f"SELECT * FROM {GENERATION};")
        require(
            len(marker) == 1 and marker[0].get("plan_sha256") == plan["sha256"],
            "Target manifest missing",
        )
        contract = await self.target.rows(
            "SELECT * FROM open_notebook:rag_embedding_contract;"
        )
        require(
            len(contract) == 1
            and _stable(contract[0])
            == {
                "id": RecordID("open_notebook", "rag_embedding_contract"),
                "model": MODEL,
                "model_id": MODEL,
                "dimensions": DIMENSIONS,
                "base_url": self.scope.target_base_url,
            },
            "Target embedding contract changed",
        )
        observed = {}
        for table, name in (
            ("source", "sources"),
            ("notebook", "notebooks"),
            ("reference", "references"),
            ("command", "commands"),
        ):
            rows = await self.target.rows(f"SELECT * FROM {table} ORDER BY id;")
            require(
                [_compared(table, row) for row in rows]
                == [_target_row(table, row) for row in data[name]],
                "Target content/reference manifest differs",
            )
            observed[name] = rows
        chunks = await self.target.rows("SELECT * FROM source_embedding ORDER BY id;")
        require(len(chunks) == len(data["chunks"]), "Target chunk inventory differs")
        for row, original in zip(chunks, data["chunks"]):
            require(
                {k: v for k, v in row.items() if k != "embedding"}
                == {k: v for k, v in original.items() if k != "embedding"},
                "Target chunk content or citation identity differs",
            )
            _vectors(
                {
                    "model": MODEL,
                    "usage": {"prompt_tokens": 1},
                    "data": [{"index": 0, "embedding": row["embedding"]}],
                },
                1,
                1,
            )
        receipts = await self.target.rows(
            "SELECT * FROM rag_shadow_source ORDER BY id;"
        )
        require(
            len(receipts) == len(data["sources"]), "Target source receipts incomplete"
        )
        receipt_map = {str(row["id"]): row for row in receipts}
        for source in data["sources"]:
            receipt = receipt_map.get(
                str(RecordID("rag_shadow_source", digest(str(source["id"]))))
            )
            vector_rows = [row for row in chunks if row["source"] == source["id"]]
            require(
                receipt is not None
                and receipt.get("source_sha256") == digest(source)
                and receipt.get("vectors_sha256") == digest(vector_rows),
                "Target vector manifest differs",
            )
        requests = await self.target.rows(
            "SELECT * FROM rag_shadow_request ORDER BY id;"
        )
        require(
            all(
                row.get("status") == "complete"
                and row.get("plan_sha256") == plan["sha256"]
                and row.get("model") == MODEL
                and type(row.get("input_tokens")) is int
                and 0 < row["input_tokens"] <= row["reserved_tokens"]
                for row in requests
            ),
            "Unresolved target request receipt",
        )
        tokens = sum(row["input_tokens"] for row in requests)
        require(
            sum(row["reserved_tokens"] for row in requests)
            == plan["reserved_input_tokens"]
            and tokens <= self.scope.max_input_tokens
            and Decimal(tokens) * CNY_PER_TOKEN <= self.scope.max_cost_cny,
            "Target request budget differs",
        )
        observed["chunks"] = chunks
        return seal(
            {
                "format": "rag-shadow-verification/v1",
                "plan_sha256": plan["sha256"],
                "counts": self.counts(data),
                "source_sha256": plan["source_sha256"],
                "target_sha256": digest(observed),
                "target_vectors_sha256": digest(chunks),
                "requests_sha256": digest(requests),
                "measured_input_tokens": tokens,
                "estimated_cost_cny": str(Decimal(tokens) * CNY_PER_TOKEN),
                "rate_cny_per_k_tokens": "0.000070",
                "old_database_retained": True,
            }
        )

    async def activate(self, plan: dict, verified: dict) -> dict:
        self.check_plan(plan)
        require(
            verified.get("sha256")
            == digest({k: v for k, v in verified.items() if k != "sha256"})
            and verified.get("plan_sha256") == plan["sha256"],
            "Verification receipt changed",
        )
        pointer = await self.pointer()
        if (
            pointer
            and pointer.get("phase") in {"activating", "active"}
            and pointer.get("active_database") == self.scope.target_database
        ):
            require(
                pointer.get("verification_sha256") == verified["sha256"],
                "Another generation is already active",
            )
            return {
                "phase": pointer["phase"],
                "active_database": self.scope.target_database,
                "revision": pointer["revision"],
                "verification_sha256": verified["sha256"],
                "old_database_retained": True,
            }
        # Seal before re-reading: neither runtime nor a stale migration writer
        # can change target data between final verification and source CAS.
        sealed = await self.target.rows(
            f"""
          UPDATE {GENERATION} SET phase='verified',verification_sha256=$verification
          WHERE plan_sha256=$plan AND phase IN ['backfilling','verified'] RETURN AFTER;
        """,
            {"plan": plan["sha256"], "verification": verified["sha256"]},
        )
        require(len(sealed) == 1, "Target sealing outcome requires inspection")
        require(
            await self.verify(plan) == verified, "Target changed since verification"
        )
        rows = await self.source.rows(
            f"""
          UPDATE {POINTER} SET phase='activating',active_database=$database,
            revision=revision+1,model=$model,base_url=$base_url,
            verification_sha256=$verification
          WHERE phase='fenced' AND plan_sha256=$plan AND revision=$revision RETURN AFTER;
        """,
            {
                "database": self.scope.target_database,
                "model": MODEL,
                "base_url": self.scope.target_base_url,
                "verification": verified["sha256"],
                "plan": plan["sha256"],
                "revision": plan["source_revision"],
            },
        )
        require(len(rows) == 1, "Activation CAS outcome requires pointer inspection")
        return {
            "phase": "activating",
            "active_database": self.scope.target_database,
            "revision": rows[0]["revision"],
            "verification_sha256": verified["sha256"],
            "old_database_retained": True,
        }

    async def finish(
        self, plan: dict, verified: dict, product_gate: dict, gate_sha256: str
    ) -> dict:
        self.check_plan(plan)
        require(
            bool(re.fullmatch(r"[a-f0-9]{64}", gate_sha256)),
            "Missing product-lock receipt hash",
        )
        pointer = await self.pointer()
        if pointer and pointer.get("phase") == "active":
            require(
                pointer.get("active_database") == self.scope.target_database
                and pointer.get("plan_sha256") == plan["sha256"]
                and pointer.get("verification_sha256") == verified["sha256"]
                and pointer.get("product_gate_sha256") == gate_sha256,
                "Another cutover is already active",
            )
            return {
                "phase": "active",
                "revision": pointer["revision"],
                "product_gate_sha256": gate_sha256,
                "verification_sha256": verified["sha256"],
                "active_database": self.scope.target_database,
            }

        def check_gate():
            require(
                product_gate.get("format") == "rag-shadow-product-lock/v1"
                and product_gate.get("plan_sha256") == plan["sha256"]
                and product_gate.get("verification_sha256") == verified["sha256"]
                and product_gate.get("binding_manifest_sha256")
                == self.scope.binding_manifest_sha256,
                "Product-lock observation differs from the approved manifest",
            )
            require(
                product_gate.get("lock_mode") == "ShareLock"
                and product_gate.get("lock_scope_sha256") == plan["lock_scope_sha256"],
                "Product-lock scope differs from the reviewed plan",
            )
            observed = datetime.fromisoformat(product_gate["observed_at"])
            deadline = datetime.fromisoformat(product_gate["deadline_at"])
            began = datetime.fromisoformat(product_gate["pg_transaction_start"])
            now = datetime.now(timezone.utc)
            require(
                observed.tzinfo is not None
                and deadline.tzinfo is not None
                and began.tzinfo is not None
                and -2 <= (now - observed).total_seconds() <= 10
                and 10 <= (deadline - now).total_seconds()
                and 0 < (deadline - began).total_seconds() <= 90,
                "Product-lock heartbeat is stale or expires before cutover",
            )
            require(
                type(product_gate.get("pg_backend_pid")) is int
                and product_gate["pg_backend_pid"] > 0
                and type(product_gate.get("held_lock_count")) is int
                and product_gate["held_lock_count"]
                >= len(self.scope.product_lock_relations)
                and all(
                    re.fullmatch(pattern, product_gate.get(key, ""))
                    for key, pattern in (
                        ("komodo_update_id", r"[a-f0-9]{24}"),
                        ("container_id", r"[a-f0-9]{64}"),
                        ("image_id", r"sha256:[a-f0-9]{64}"),
                        ("command_sha256", r"[a-f0-9]{64}"),
                    )
                )
                and bool(product_gate.get("pg_backend_start")),
                "Product-lock native identity is incomplete",
            )

        check_gate()
        require(
            await self.verify(plan, activating=True) == verified,
            "Sealed target changed before final cutover",
        )
        target = await self.target.rows(f"SELECT * FROM {GENERATION};")
        require(
            len(target) == 1
            and target[0].get("phase") == "verified"
            and target[0].get("verification_sha256") == verified["sha256"],
            "Target is not sealed for final cutover",
        )
        check_gate()
        rows = await self.source.rows(
            f"""
          UPDATE {POINTER} SET phase='active',product_gate_sha256=$gate
          WHERE phase='activating' AND active_database=$database AND revision=$revision
            AND plan_sha256=$plan AND verification_sha256=$verification RETURN AFTER;
        """,
            {
                "gate": gate_sha256,
                "database": self.scope.target_database,
                "revision": plan["source_revision"] + 1,
                "plan": plan["sha256"],
                "verification": verified["sha256"],
            },
        )
        require(len(rows) == 1, "Final cutover CAS outcome requires pointer inspection")
        return {
            "phase": "active",
            "revision": rows[0]["revision"],
            "product_gate_sha256": gate_sha256,
            "verification_sha256": verified["sha256"],
            "active_database": self.scope.target_database,
        }


def environment_store(namespace: str, database: str) -> Store:
    from open_notebook.database.repository import (
        get_database_password,
        get_database_url,
    )

    return Store(
        get_database_url(),
        os.environ.get("SURREAL_USER", ""),
        get_database_password(),
        namespace,
        database,
    )


def validate_proxy_base(current: str, target: str) -> None:
    require(
        current.rstrip("/").endswith("/internal/open-notebook/v1")
        and target == current.rstrip("/") + "/shadow",
        "Target proxy must be the configured origin's Pro-only route",
    )


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "action",
        choices=[
            "plan",
            "fence",
            "status",
            "backfill",
            "verify",
            "activate",
            "finish",
            "abort",
        ],
    )
    parser.add_argument("--scope", required=True)
    parser.add_argument(
        "--bindings",
        required=True,
        help="Private authoritative product-binding receipt; freshly reconcile before activate",
    )
    parser.add_argument("--plan")
    parser.add_argument("--verification")
    parser.add_argument(
        "--product-gate",
        help="Fresh native PG-lock observation verified by the production coordinator",
    )
    parser.add_argument("--output", required=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    require(
        args.action in {"plan", "status", "verify"} or args.execute,
        "Mutation requires explicit --execute",
    )
    require(
        not Path(args.output).exists(),
        "Output already exists; inspect its recorded outcome",
    )
    scope = Scope.model_validate_json(Path(args.scope).read_text())
    binding_bytes = Path(args.bindings).read_bytes()
    require(
        hashlib.sha256(binding_bytes).hexdigest() == scope.binding_manifest_sha256,
        "Authoritative product-binding receipt bytes changed",
    )
    bindings = json.loads(binding_bytes)
    require(
        bindings.get("format") == "rag-shadow-bindings/v1"
        and bindings.get("namespace") == scope.namespace
        and bindings.get("source_database") == scope.source_database
        and sorted(bindings.get("notebook_ids", [])) == sorted(scope.notebook_ids)
        and sorted(bindings.get("sources", []), key=lambda row: row["source_id"])
        == sorted(
            [row.model_dump() for row in scope.authoritative_bindings],
            key=lambda row: row["source_id"],
        ),
        "Authoritative product-binding receipt does not identify the approved scope",
    )
    validate_proxy_base(os.environ.get("OPENAI_BASE_URL", ""), scope.target_base_url)
    require(
        os.environ.get("SURREAL_NAMESPACE", "open_notebook") == scope.namespace
        and os.environ.get("SURREAL_DATABASE", "open_notebook")
        == scope.source_database,
        "Environment does not identify the approved source",
    )

    async def embed(texts: list[str], company_id: str, request_id: str) -> dict:
        key = os.environ.get("OPENAI_API_KEY", "")
        require(bool(key), "Existing embedding service credential is required")
        async with httpx.AsyncClient(timeout=90, follow_redirects=False) as client:
            response = await client.post(
                scope.target_base_url + "/embeddings",
                headers={
                    "Authorization": f"Bearer {key}",
                    "X-Lingxi-Company-Id": company_id,
                    "X-Lingxi-Shadow-Request-Id": request_id,
                },
                json={"model": MODEL, "input": texts},
            )
            require(
                response.status_code == 200
                and response.headers.get("x-lingxi-shadow-request-id") == request_id,
                "Paid embedding request failed; inspect the pending receipt before recovery",
            )
            return response.json()

    op = ShadowMigration(
        scope,
        environment_store(scope.namespace, scope.source_database),
        environment_store(scope.namespace, scope.target_database),
        embed,
    )

    def read_receipt(path: str, action: str) -> dict:
        receipt = json.loads(Path(path).read_text())
        require(
            receipt.get("complete") is True and receipt.get("action") == action,
            "A completed sealed receipt for the expected action is required",
        )
        return receipt["result"]

    plan = read_receipt(args.plan, "plan") if args.plan else None
    require(args.action == "plan" or isinstance(plan, dict), "Sealed plan is required")
    # Reserve the exclusive receipt path before submitting an operation.
    fd = os.open(args.output, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "w") as output:
        try:
            if args.action == "plan":
                result = await op.plan()
            elif args.action == "activate":
                require(bool(args.verification), "Sealed verification is required")
                result = await op.activate(
                    plan, read_receipt(args.verification, "verify")
                )
            elif args.action == "finish":
                require(
                    bool(args.verification) and bool(args.product_gate),
                    "Final cutover requires verification and a fresh live product-lock gate",
                )
                gate_bytes = Path(args.product_gate).read_bytes()
                result = await op.finish(
                    plan,
                    read_receipt(args.verification, "verify"),
                    read_receipt(args.product_gate, "product-lock"),
                    hashlib.sha256(gate_bytes).hexdigest(),
                )
            else:
                result = await getattr(op, args.action)(plan)
            json.dump(
                {"complete": True, "action": args.action, "result": result},
                output,
                default=_json,
                sort_keys=True,
            )
        except Exception as error:
            json.dump(
                {
                    "complete": False,
                    "action": args.action,
                    "reason": str(error)
                    if isinstance(error, ShadowError)
                    else "Database/provider outcome requires inspection",
                    "outcome": "inspect-existing-pointer-fence-and-request-receipts",
                },
                output,
            )
            raise


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception:
        # No remote response, IDs, credentials or corpus text in terminal errors.
        raise SystemExit(
            "Shadow operation stopped. Inspect the private receipt and existing database state; do not replay unknown paid requests."
        )
