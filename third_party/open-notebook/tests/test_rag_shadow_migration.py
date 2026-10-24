"""Operator integration checks: real isolated SurrealDB, synthetic corpus only."""

import json
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import pytest_asyncio
from surrealdb import RecordID

from open_notebook.rag.shadow import Scope, ShadowMigration, Store, digest


async def finish_cutover(op, plan, verified, **updates):
    # Synthetic external PG-lock observation; these tests do not claim any
    # production lock. The real coordinator verifies the native held operation.
    now = datetime.now(timezone.utc)
    gate = {
        "format": "rag-shadow-product-lock/v1",
        "plan_sha256": plan["sha256"],
        "verification_sha256": verified["sha256"],
        "binding_manifest_sha256": op.scope.binding_manifest_sha256,
        "observed_at": now.isoformat(),
        "deadline_at": (now + timedelta(seconds=80)).isoformat(),
        "pg_backend_pid": 123,
        "pg_backend_start": now.isoformat(),
        "pg_transaction_start": now.isoformat(),
        "held_lock_count": 7,
        "lock_mode": "ShareLock",
        "lock_scope_sha256": plan["lock_scope_sha256"],
        "komodo_update_id": "a" * 24,
        "container_id": "b" * 64,
        "image_id": "sha256:" + "c" * 64,
        "command_sha256": "d" * 64,
    }
    gate.update(updates)
    return await op.finish(plan, verified, gate, digest(gate))


@pytest_asyncio.fixture
async def migration():
    # Opt in to an explicitly supplied loopback test server, never production.
    endpoint = os.environ.get("RAG_SHADOW_TEST_URL", "")
    if endpoint != "ws://127.0.0.1:18879/rpc":
        pytest.skip("requires the isolated synthetic SurrealDB test server")
    namespace = "test_shadow_" + uuid.uuid4().hex
    scope = Scope(
        migration_id="synthetic_" + uuid.uuid4().hex,
        namespace=namespace,
        source_database="old",
        target_database="pro",
        company_ids=["company-a"],
        source_ids=["source:paper"],
        notebook_ids=["notebook:course"],
        max_notebooks=1,
        binding_manifest_sha256="a" * 64,
        authoritative_bindings=[
            {
                "source_id": "source:paper",
                "company_id": "company-a",
                "notebook_ids": ["notebook:course"],
            }
        ],
        max_sources=1,
        max_chunks=3,
        max_input_tokens=10000,
        max_cost_cny="0.01",
        target_base_url="https://loop.example/internal/open-notebook/v1/shadow",
    )
    source = Store(endpoint, "test", "test", namespace, "old")
    target = Store(endpoint, "test", "test", namespace, "pro")
    schema = Path(__file__).parents[1] / "open_notebook/rag/schema.surrealql"
    await source.run(schema.read_text())
    await source.run(
        """
      CREATE open_notebook:rag_embedding_contract SET model='BAAI/bge-m3',
        model_id='BAAI/bge-m3',base_url='https://loop.example/internal/open-notebook/v1',dimensions=1024;
      CREATE notebook:course SET name='Course', external_key='company-a:course';
      CREATE command:done SET status='completed',app='open_notebook',name='process_source',
        args={private_payload:'must never copy'},context={private_context:'must never copy'},
        result={source_id:'source:paper',embedded_chunks:2};
      CREATE source:paper SET title='Paper',full_text='[[PAGE:7]]\\nEvidence source',
        company_id='company-a',external_key='upload-key',ingestion_fingerprint='fingerprint',
        command=command:done,asset={file_path:'r2://shared/source.pdf',owned:true};
      RELATE source:paper->reference:course->notebook:course;
      CREATE source_embedding:first SET source=source:paper,order=0,content='[[PAGE:7]] Evidence',embedding=$vector;
      CREATE source_embedding:second SET source=source:paper,order=1,content='Independent citation',embedding=$vector;
    """,
        {"vector": [0.5] * 1024},
    )
    calls = []

    async def embed(texts, company_id, request_id):
        assert re.fullmatch(r"[a-f0-9]{64}", request_id)
        calls.append((list(texts), company_id))
        return {
            "model": "Pro/BAAI/bge-m3",
            "usage": {"prompt_tokens": len(texts)},
            "data": [
                {"index": i, "embedding": [1.0] * 1024} for i in range(len(texts))
            ],
        }

    operation = ShadowMigration(scope, source, target, embed)
    yield operation, calls


@pytest.mark.asyncio
async def test_shadow_backfill_preserves_old_vectors_citations_and_terminal_history(
    migration,
):
    op, calls = migration
    plan = await op.plan()
    before = await op.source.rows("SELECT * FROM source_embedding ORDER BY id;")
    assert "Evidence" not in str(plan)
    assert "source:paper" not in str(plan)
    await op.fence(plan)
    with pytest.raises(RuntimeError):
        await op.source.run("UPDATE source:paper SET title='late writer';")
    await op.backfill(plan)
    await op.backfill(plan)  # no second provider charge
    assert len(calls) == 1
    assert await op.source.rows("SELECT * FROM source_embedding ORDER BY id;") == before
    chunks = await op.target.rows("SELECT * FROM source_embedding ORDER BY id;")
    assert [str(row["id"]) for row in chunks] == [str(row["id"]) for row in before]
    source = (await op.target.rows("SELECT * FROM source:paper;"))[0]
    original_source = (await op.source.rows("SELECT * FROM source:paper;"))[0]
    assert source["created"] == original_source["created"]
    assert source["asset"]["owned"] is False
    assert str(source["command"]) == "command:done"
    terminal = (await op.target.rows("SELECT * FROM command:done;"))[0]
    assert terminal["status"] == "completed"
    assert "args" not in terminal and "context" not in terminal
    assert (await op.target.rows("SELECT in,out FROM reference;"))[0] == {
        "in": RecordID("source", "paper"),
        "out": RecordID("notebook", "course"),
    }
    verified = await op.verify(plan)
    assert verified["counts"] == {
        "sources": 1,
        "notebooks": 1,
        "references": 1,
        "chunks": 2,
        "commands": 1,
    }
    activated = await op.activate(plan, verified)
    assert activated["active_database"] == "pro"
    assert (
        await op.activate(plan, verified) == activated
    )  # inspect known success, never repeat CAS
    assert activated["phase"] == "activating"
    await finish_cutover(op, plan, verified)
    with pytest.raises(RuntimeError):
        await op.source.run("DELETE source:paper;")
    # The target stays frozen until a reader proves the shared pointer.
    from open_notebook.rag.generation import resolve_environment

    await resolve_environment(
        {
            "SURREAL_DATABASE": "old",
            "SURREAL_NAMESPACE": op.scope.namespace,
            "OPENAI_BASE_URL": "https://loop.example/internal/open-notebook/v1",
            "OPENAI_EMBEDDING_MODEL": "BAAI/bge-m3",
        },
        op.source,
    )
    ordinary = Store(
        op.target.url, "test", "test", op.target.namespace, op.target.database
    )
    await ordinary.run("UPDATE source:paper SET title='new active write';")


@pytest.mark.asyncio
async def test_global_pointer_refuses_partial_scope_and_unsettled_sources(migration):
    op, _ = migration
    await op.source.run(
        "CREATE notebook:outside SET name='Outside',external_key='company-b:outside';"
    )
    with pytest.raises(ValueError, match="scope"):
        await op.plan()
    await op.source.run("DELETE notebook:outside;")
    await op.source.run(
        "CREATE source:extra SET company_id='company-b',external_key='extra',ingestion_fingerprint='extra';"
    )
    with pytest.raises(ValueError, match="scope"):
        await op.plan()
    await op.source.run(
        "DELETE source:extra; UPDATE command:done SET status='running';"
    )
    with pytest.raises(ValueError, match="command"):
        await op.plan()


@pytest.mark.asyncio
async def test_authoritative_reference_mapping_and_byte_budget_are_required(migration):
    op, _ = migration
    await op.source.run("DELETE reference:course;")
    with pytest.raises(ValueError, match="authoritative"):
        await op.plan()
    await op.source.run("RELATE source:paper->reference:course->notebook:course;")
    op.scope = op.scope.model_copy(update={"max_manifest_bytes": 1})
    with pytest.raises(ValueError, match="byte budget"):
        await op.plan()


@pytest.mark.asyncio
async def test_fence_detects_changed_source_and_abort_retains_shadow(migration):
    op, _ = migration
    plan = await op.plan()
    await op.source.run("UPDATE source:paper SET title='edited';")
    with pytest.raises(ValueError, match="watermark"):
        await op.fence(plan)
    # Fence is visible even when the accepted snapshot changed.
    with pytest.raises(RuntimeError):
        await op.source.run("UPDATE source:paper SET title='another edit';")
    await op.abort(plan)
    await op.source.run("UPDATE source:paper SET title='resumed';")


@pytest.mark.asyncio
async def test_abort_can_be_replanned_and_installed_fence_fails_closed(migration):
    op, _ = migration
    plan = await op.plan()
    await op.fence(plan)
    with pytest.raises(RuntimeError):
        await op.source.run(
            "UPDATE open_notebook:rag_embedding_contract SET updated=time::now();"
        )
    await op.abort(plan)
    replanned = await op.plan()
    assert replanned["source_revision"] == 1
    await op.fence(replanned)
    await op.source.run("DELETE open_notebook:rag_active_generation;")
    with pytest.raises(ValueError, match="pointer"):
        await op.plan()
    with pytest.raises(RuntimeError):
        await op.source.run(
            "UPDATE source:paper SET title='cannot bypass lost pointer';"
        )


@pytest.mark.asyncio
async def test_provider_model_failure_is_not_replayed(migration):
    op, calls = migration
    plan = await op.plan()
    await op.fence(plan)
    delegate = op.embed

    async def wrong_model(texts, company, request_id):
        result = await delegate(texts, company, request_id)
        result["model"] = "BAAI/bge-m3"
        return result

    op.embed = wrong_model
    with pytest.raises(ValueError, match="model"):
        await op.backfill(plan)
    op.embed = delegate
    with pytest.raises(ValueError, match="unknown|unresolved"):
        await op.backfill(plan)
    assert len(calls) == 1
    assert not await op.target.rows("SELECT * FROM source_embedding;")


@pytest.mark.asyncio
async def test_completed_paid_response_survives_unsubmitted_source_transaction(
    migration,
):
    op, calls = migration
    plan = await op.plan()
    await op.fence(plan)
    original = op.target.run

    async def interrupted(query, variables=None):
        if "CREATE $source_id CONTENT $source" in query:
            raise RuntimeError(
                "synthetic interruption before source transaction submission"
            )
        return await original(query, variables)

    op.target.run = interrupted
    with pytest.raises(RuntimeError):
        await op.backfill(plan)
    assert len(calls) == 1
    op.target.run = original
    await op.backfill(plan)
    assert len(calls) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure", ["dimensions", "nonfinite", "zero", "indices", "usage"]
)
async def test_invalid_paid_result_never_creates_searchable_chunks(migration, failure):
    op, _ = migration
    plan = await op.plan()
    await op.fence(plan)
    delegate = op.embed

    async def malformed(texts, company, request_id):
        result = await delegate(texts, company, request_id)
        if failure == "dimensions":
            result["data"][0]["embedding"] = [1.0]
        if failure == "nonfinite":
            result["data"][0]["embedding"][0] = float("nan")
        if failure == "zero":
            result["data"][0]["embedding"] = [0.0] * 1024
        if failure == "indices":
            result["data"][1]["index"] = 0
        if failure == "usage":
            result["usage"]["prompt_tokens"] = 1000000
        return result

    op.embed = malformed
    with pytest.raises(ValueError):
        await op.backfill(plan)
    assert not await op.target.rows("SELECT * FROM source_embedding;")


@pytest.mark.asyncio
async def test_budget_target_drift_and_stale_verification_block_cutover(migration):
    op, _ = migration
    op.scope = op.scope.model_copy(update={"max_input_tokens": 1})
    with pytest.raises(ValueError, match="budget"):
        await op.plan()
    op.scope = op.scope.model_copy(update={"max_input_tokens": 10000})
    plan = await op.plan()
    await op.fence(plan)
    await op.backfill(plan)
    verified = await op.verify(plan)
    await op.target.run("UPDATE source_embedding:first SET content='tampered';")
    with pytest.raises(ValueError, match="[Tt]arget|manifest"):
        await op.activate(plan, verified)
    pointer = await op.source.rows("SELECT * FROM open_notebook:rag_active_generation;")
    assert pointer[0]["active_database"] == "old"
    assert digest(pointer) != verified["sha256"]


@pytest.mark.asyncio
async def test_target_is_fenced_across_verification_cas_and_reader_start(migration):
    from open_notebook.rag.generation import resolve_environment

    op, _ = migration
    plan = await op.plan()
    environment = {
        "SURREAL_DATABASE": "pro",
        "SURREAL_NAMESPACE": op.scope.namespace,
        "OPENAI_BASE_URL": "https://loop.example/internal/open-notebook/v1",
        "OPENAI_EMBEDDING_MODEL": "BAAI/bge-m3",
    }
    await op.fence(plan)
    await op.backfill(plan)
    ordinary = Store(
        op.target.url, "test", "test", op.target.namespace, op.target.database
    )
    with pytest.raises(ValueError, match="fenced"):
        await resolve_environment(environment, ordinary)
    verified = await op.verify(plan)
    with pytest.raises(RuntimeError):
        await ordinary.run(
            "UPDATE source_embedding:first SET content='post-verify mutation';"
        )
    await op.activate(plan, verified)
    with pytest.raises(RuntimeError):
        await ordinary.run(
            "UPDATE source_embedding:first SET content='pre-reader mutation';"
        )
    with pytest.raises(ValueError, match="fenced"):
        await resolve_environment(environment, ordinary)
    await finish_cutover(op, plan, verified)
    resolved = await resolve_environment(environment, ordinary)
    assert resolved["OPEN_NOTEBOOK_GENERATION_CONTROL_DATABASE"] == "old"
    await ordinary.run("UPDATE source:paper SET title='new active write';")


@pytest.mark.asyncio
async def test_stale_product_lock_keeps_cutover_closed_and_abort_retains_target(
    migration,
):
    from open_notebook.rag.generation import resolve_environment

    op, _ = migration
    plan = await op.plan()
    await op.fence(plan)
    await op.backfill(plan)
    verified = await op.verify(plan)
    await op.activate(plan, verified)
    with pytest.raises(ValueError, match="manifest"):
        await finish_cutover(op, plan, verified, binding_manifest_sha256="f" * 64)
    with pytest.raises(ValueError, match="stale"):
        await finish_cutover(
            op,
            plan,
            verified,
            observed_at=(
                datetime.now(timezone.utc) - timedelta(seconds=30)
            ).isoformat(),
        )
    pointer = await op.pointer()
    assert pointer["phase"] == "activating"
    with pytest.raises(ValueError, match="fenced"):
        await resolve_environment({"SURREAL_DATABASE": "old"}, op.source)
    await op.abort(plan)
    assert (await op.pointer())["active_database"] == "old"
    assert await op.target.rows("SELECT * FROM source_embedding;")


@pytest.mark.asyncio
async def test_startup_pins_api_worker_and_stale_process_fails_closed(migration):
    from open_notebook.rag.generation import generation_status, resolve_environment

    op, _ = migration
    environment = {
        "SURREAL_DATABASE": "old",
        "SURREAL_NAMESPACE": op.scope.namespace,
        "OPENAI_EMBEDDING_MODEL": "BAAI/bge-m3",
        "OPENAI_BASE_URL": "https://loop.example/internal/open-notebook/v1",
    }
    legacy = await resolve_environment(environment, op.source)
    assert legacy["SURREAL_DATABASE"] == "old"
    plan = await op.plan()
    await op.fence(plan)
    with pytest.raises(ValueError, match="fenced"):
        await resolve_environment(environment, op.source)
    await op.backfill(plan)
    verified = await op.verify(plan)
    await op.activate(plan, verified)
    await finish_cutover(op, plan, verified)
    with pytest.raises(ValueError, match="stale"):
        await generation_status(legacy, op.source)
    active = await resolve_environment(environment, op.source)
    assert active["SURREAL_DATABASE"] == "pro"
    assert active["OPENAI_EMBEDDING_MODEL"] == "Pro/BAAI/bge-m3"
    assert active["OPENAI_BASE_URL"] == op.scope.target_base_url
    status = await generation_status(active, op.source)
    assert status["verification_sha256"] == verified["sha256"]
    assert status["revision"] == 1
    with pytest.raises(ValueError):
        await generation_status(
            {**active, "OPENAI_EMBEDDING_MODEL": "BAAI/bge-m3"}, op.source
        )


@pytest.mark.asyncio
async def test_cli_private_plan_and_fresh_status_receipt_roundtrip(
    migration, monkeypatch, tmp_path
):
    import hashlib

    from open_notebook.rag.shadow import main

    op, _ = migration
    bindings = {
        "format": "rag-shadow-bindings/v1",
        "namespace": op.scope.namespace,
        "source_database": "old",
        "notebook_ids": op.scope.notebook_ids,
        "sources": [row.model_dump() for row in op.scope.authoritative_bindings],
    }
    binding_file = tmp_path / "bindings.json"
    binding_file.write_text(json.dumps(bindings, sort_keys=True, separators=(",", ":")))
    op.scope = op.scope.model_copy(
        update={
            "binding_manifest_sha256": hashlib.sha256(
                binding_file.read_bytes()
            ).hexdigest()
        }
    )
    scope_file, plan_file, status_file = [
        tmp_path / name for name in ("scope.json", "plan.json", "status.json")
    ]
    scope_file.write_text(op.scope.model_dump_json())
    for key, value in {
        "SURREAL_URL": op.source.url,
        "SURREAL_USER": "test",
        "SURREAL_PASSWORD": "test",
        "SURREAL_NAMESPACE": op.scope.namespace,
        "SURREAL_DATABASE": "old",
        "OPENAI_BASE_URL": "https://loop.example/internal/open-notebook/v1",
    }.items():
        monkeypatch.setenv(key, value)
    common = ["--scope", str(scope_file), "--bindings", str(binding_file)]
    monkeypatch.setattr(
        "sys.argv", ["shadow", "plan", *common, "--output", str(plan_file)]
    )
    await main()
    planned = json.loads(plan_file.read_text())
    assert (
        planned["complete"] is True
        and planned["result"]["format"] == "rag-shadow-plan/v1"
    )
    assert plan_file.stat().st_mode & 0o777 == 0o600
    assert "source:paper" not in plan_file.read_text()
    await op.fence(planned["result"])
    monkeypatch.setattr(
        "sys.argv",
        [
            "shadow",
            "status",
            *common,
            "--plan",
            str(plan_file),
            "--output",
            str(status_file),
        ],
    )
    await main()
    status = json.loads(status_file.read_text())
    assert status["complete"] is True and status["action"] == "status"
    assert status["result"]["format"] == "rag-shadow-fence/v1"
    assert status["result"]["plan_sha256"] == planned["result"]["sha256"]
