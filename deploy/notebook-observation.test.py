"""No Docker/provider/database connection: fixed read contract and output privacy."""
import importlib.util
import json
import pathlib
import sys
import types
import unittest

ROOT = pathlib.Path(__file__).parent
SECRET = "NEVER_PRINT_SOURCE_PROMPT_OR_CREDENTIAL"


def fixture(*, phase="active"):
    calls = []
    pointer = {"phase": phase, "active_database": "pro", "revision": 1,
               "model": "Pro/BAAI/bge-m3", "base_url": "https://backend.example/internal/open-notebook/v1/shadow",
               "plan_sha256": "a" * 64, "verification_sha256": "b" * 64, "product_gate_sha256": "c" * 64,
               "private": SECRET}
    snapshots = {
        "open_notebook": {"model": "BAAI/bge-m3", "base_url": "https://loop.example/internal/open-notebook/v1", "sample": 768, "invalid": 12},
        "pro": {"model": "Pro/BAAI/bge-m3", "base_url": pointer["base_url"], "sample": 1024, "invalid": 0},
    }

    class RecordID:
        def __init__(self, table, key):
            self.table, self.key = table, key

        def __str__(self):
            return self.table + ":" + self.key

    surreal = types.ModuleType("surrealdb")
    surreal.RecordID = RecordID
    sys.modules["surrealdb"] = surreal

    class Store:
        def __init__(self, url, user, password, namespace, database):
            self.url, self.user, self.password, self.namespace, self.database = url, user, password, namespace, database

        async def rows(self, query):
            calls.append((self.database, query))
            assert query.startswith("SELECT "), "no mutation or startup resolver is allowed"
            data = snapshots[self.database]
            if "rag_active_generation" in query:
                return [pointer] if self.database == "open_notebook" else []
            if "rag_shadow_generation" in query:
                return [{"phase": "verified", "plan_sha256": "a" * 64, "verification_sha256": "b" * 64, "private": SECRET}] if self.database == "pro" else []
            if "rag_embedding_contract" in query:
                return [{"model": data["model"], "model_id": data.get("model_id", data["model"]), "base_url": data["base_url"], "dimensions": 1024, "body": SECRET}]
            if "rag_schema" in query:
                return [{"version": 1}]
            if "WHERE array::len" in query:
                return [{"n": data["invalid"]}]
            if "LIMIT 1" in query:
                return [{"dimensions": data["sample"]}]
            if "count()" in query:
                return [{"n": 12}]
            raise AssertionError("unreviewed query")

    shadow = types.ModuleType("open_notebook.rag.shadow")
    shadow.GENERATION, shadow.POINTER = "open_notebook:rag_shadow_generation", "open_notebook:rag_active_generation"
    shadow.Store = Store
    shadow.environment_store = lambda namespace, database: Store("ws://internal", "existing", SECRET, namespace, database)
    sys.modules["open_notebook.rag.shadow"] = shadow
    spec = importlib.util.spec_from_file_location("notebook_observation", ROOT / "notebook-embedding-observe.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module, calls, snapshots


class NotebookObservationTests(unittest.IsolatedAsyncioTestCase):
    async def test_retained_and_active_generation_metadata_without_content_or_activation(self):
        module, calls, _ = fixture()
        observed = await module.observe_detailed()
        self.assertEqual(observed["control"]["contract"]["model"], "BAAI/bge-m3")
        self.assertEqual(observed["control"]["sampledDimensions"], 768)
        self.assertEqual(observed["control"]["invalidDimensions"], 12)
        self.assertEqual(observed["active"]["contract"]["model"], "Pro/BAAI/bge-m3")
        self.assertEqual(observed["active"]["generation"]["phase"], "verified")
        self.assertTrue(observed["pointerStable"])
        self.assertTrue(observed["observationOnly"])
        self.assertNotIn(SECRET, json.dumps(observed))
        self.assertLessEqual(len(calls), 16)

    async def test_a_fenced_generation_is_observed_without_finishing_or_activating_it(self):
        module, calls, _ = fixture(phase="activating")
        observed = await module.observe_detailed()
        self.assertEqual(observed["pointer"]["phase"], "activating")
        self.assertEqual(observed["active"]["generation"]["phase"], "verified")
        self.assertTrue(all(query.startswith("SELECT ") for _, query in calls))

    async def test_existing_preflight_shape_is_preserved(self):
        module, _, _ = fixture()
        observed = await module.observe()
        self.assertEqual(observed["schemaVersion"], 1)
        self.assertEqual(observed["contract"]["model"], "Pro/BAAI/bge-m3")
        self.assertEqual(observed["generation"]["phase"], "verified")
        self.assertEqual(observed["invalidDimensions"], 0)

    async def test_retained_legacy_record_model_id_is_only_an_identifier(self):
        module, _, data = fixture()
        data["open_notebook"]["model_id"] = module.RecordID("model", "legacy")
        observed = await module.observe_detailed()
        self.assertEqual(observed["control"]["contract"]["model_id"], "model:legacy")

    async def test_url_credentials_are_never_printed_as_contract_metadata(self):
        module, _, data = fixture()
        data["pro"]["base_url"] = "https://user:" + SECRET + "@backend.example/v1?token=" + SECRET
        with self.assertRaises(ValueError):
            await module.observe_detailed()


if __name__ == "__main__":
    unittest.main()
