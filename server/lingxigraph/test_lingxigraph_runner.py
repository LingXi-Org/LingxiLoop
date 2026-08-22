from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from types import MappingProxyType, SimpleNamespace

from lingxigraph.messages import AIMessage

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lingxigraph_runner import UsageTrackingModel
from lingxigraph_graph import _apply_steering


class _RecordingModel:
    model = "deepseek-v4-flash"

    def __init__(self) -> None:
        self.messages = None
        self.kwargs = None

    async def agenerate(self, messages, *, tools=None, **kwargs):
        self.messages = messages
        self.kwargs = kwargs
        return AIMessage('{"status":"done"}', usage={"prompt_tokens": 3, "completion_tokens": 2})


class UsageTrackingModelTests(unittest.IsolatedAsyncioTestCase):
    async def test_translates_raw_schema_to_deepseek_json_mode(self) -> None:
        inner = _RecordingModel()
        model = UsageTrackingModel(inner)
        schema = {
            "type": "object",
            "required": ["status"],
            "properties": {"status": {"type": "string"}},
        }

        await model.agenerate([], response_format=schema)

        self.assertEqual(inner.kwargs["response_format"], {"type": "json_object"})
        instruction = inner.messages[-1].content
        self.assertIn("JSON object", instruction)
        self.assertIn(json.dumps(schema, separators=(",", ":")), instruction)
        self.assertEqual(model.calls[0]["usage"]["inputTokens"], 3)

    async def test_leaves_provider_response_format_unchanged(self) -> None:
        inner = _RecordingModel()
        model = UsageTrackingModel(inner)

        await model.agenerate([], response_format={"type": "json_object"})

        self.assertEqual(inner.kwargs["response_format"], {"type": "json_object"})
        self.assertEqual(inner.messages, [])


class RuntimeStateTests(unittest.TestCase):
    def test_steering_returns_a_mutable_update_for_runtime_mappingproxy(self) -> None:
        state = MappingProxyType({"contextPrompt": "Existing context", "generation": 0})

        updated = _apply_steering(
            state,
            (SimpleNamespace(kind="message.new", payload={"messageId": "message-1", "mailboxPhase": "CURRENT_TURN"}),),
        )

        updated["generation"] = 1
        self.assertEqual(updated["generation"], 1)
        self.assertIn('"messageId":"message-1"', updated["contextPrompt"])
        self.assertIn('"mailboxPhase":"CURRENT_TURN"', updated["contextPrompt"])
        self.assertEqual(state["generation"], 0)


if __name__ == "__main__":
    unittest.main()
