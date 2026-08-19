"""LingxiLoop's communication-only, stateless LingxiGraph runner.

`_run()` is the reasoning core shared by both entry points:

- `server.py` — the HTTP runtime (`POST /v1/turn`), the supported path.
- `main()` below — a stdin/stdout CLI kept for local, dependency-free
  smoke-testing of `_run()` without standing up the HTTP server.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from typing import Any, Mapping

from lingxigraph import HumanMessage, create_agent
from lingxigraph.integrations.openai_compat import OpenAICompatChatModel


ACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["status", "reason", "actions"],
    "properties": {
        "status": {"type": "string", "enum": ["done", "needs_clarification", "blocked", "waiting"]},
        "reason": {"type": "string"},
        "actions": {
            "type": "array",
            "maxItems": 16,
            "items": {
                "oneOf": [
                    {"type": "object", "additionalProperties": False, "required": ["type", "conversationId", "body"], "properties": {"type": {"const": "message.send"}, "conversationId": {"type": "string", "minLength": 1}, "body": {"type": "string", "minLength": 1}, "quoteMessageId": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "messageId", "emoji"], "properties": {"type": {"const": "reaction.toggle"}, "messageId": {"type": "string", "minLength": 1}, "emoji": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "participantId", "topic", "openingMessage"], "properties": {"type": {"const": "conversation.dm.create"}, "participantId": {"type": "string", "minLength": 1}, "topic": {"type": "string", "minLength": 1}, "openingMessage": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "title", "memberIds", "reason", "openingMessage"], "properties": {"type": {"const": "conversation.group.create"}, "title": {"type": "string", "minLength": 1}, "memberIds": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}}, "reason": {"type": "string", "minLength": 1}, "openingMessage": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "conversationId", "participantId"], "properties": {"type": {"enum": ["conversation.member.invite", "conversation.member.remove"]}, "conversationId": {"type": "string", "minLength": 1}, "participantId": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "conversationId"], "properties": {"type": {"const": "conversation.leave"}, "conversationId": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "to", "subject", "body"], "properties": {"type": {"const": "email.send"}, "to": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}}, "cc": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}}, "subject": {"type": "string", "minLength": 1}, "body": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "messageId", "body"], "properties": {"type": {"const": "email.reply"}, "messageId": {"type": "string", "minLength": 1}, "body": {"type": "string", "minLength": 1}, "cc": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "conversationId", "question", "options"], "properties": {"type": {"const": "poll.create"}, "conversationId": {"type": "string", "minLength": 1}, "question": {"type": "string", "minLength": 1}, "options": {"type": "array", "minItems": 2, "items": {"type": "string", "minLength": 1}}, "mode": {"type": "string", "enum": ["single", "multi"]}, "expiresInMinutes": {"type": "number", "exclusiveMinimum": 0}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "messageId", "optionIds"], "properties": {"type": {"const": "poll.vote"}, "messageId": {"type": "string", "minLength": 1}, "optionIds": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "messageId"], "properties": {"type": {"const": "poll.close"}, "messageId": {"type": "string", "minLength": 1}}},
                ]
            },
        },
    },
}


class CapturingLedger:
    def __init__(self, model: str) -> None:
        self.model = model
        self.calls: list[dict[str, Any]] = []

    def record(self, _scope: str, usage: Mapping[str, Any]) -> None:
        self.calls.append({"model": self.model, "usage": _normalize_usage(usage)})

    def snapshot(self, _scope: str) -> Mapping[str, Any]:
        return {}

    def restore(self, _scope: str, _snapshot: Mapping[str, Any]) -> None:
        return None


def _normalize_usage(usage: Mapping[str, Any]) -> dict[str, int] | None:
    if not usage:
        return None
    prompt = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    cached = int(usage.get("cache_hit_tokens") or usage.get("cached_input_tokens") or 0)
    cache_write = int(usage.get("cache_write_tokens") or usage.get("cache_creation_tokens") or 0)
    completion = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
    return {
        "inputTokens": prompt,
        "cachedInputTokens": cached,
        "cacheCreationTokens": cache_write,
        "outputTokens": completion,
    }


async def _run(request: Mapping[str, Any]) -> dict[str, Any]:
    if request.get("version") != 1:
        raise ValueError("request version must be 1")
    agent = request.get("agent")
    if not isinstance(agent, Mapping):
        raise ValueError("agent is required")
    model_name = str(agent.get("model") or "").strip()
    if not model_name:
        raise ValueError("agent.model is required")
    system_prompt = str(request.get("systemPrompt") or "").strip()
    context_prompt = str(request.get("contextPrompt") or "").strip()
    if not system_prompt or not context_prompt:
        raise ValueError("systemPrompt and contextPrompt are required")

    ledger = CapturingLedger(model_name)
    model = OpenAICompatChatModel(
        model_name,
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        api_key=os.getenv("OPENAI_API_KEY"),
        timeout=float(os.getenv("LINGXIGRAPH_MODEL_TIMEOUT_SECONDS", "90")),
        cache_first=False,
        usage_ledger=ledger,
    )
    graph = create_agent(
        model,
        tools=(),
        system_prompt=system_prompt,
        response_format=ACTION_SCHEMA,
        structured_retries=2,
        cache_first=False,
        name="lingxiloop-communication",
    )
    output = await graph.ainvoke(
        {"messages": [HumanMessage(context_prompt)]},
        {"max_model_calls": 4, "max_tokens": 32000},
    )
    structured = output.get("structured_response")
    if not isinstance(structured, Mapping):
        raise ValueError("graph did not return structured_response")
    return {
        "version": 1,
        "status": structured["status"],
        "reason": structured["reason"],
        "actions": structured["actions"],
        "modelCalls": ledger.calls,
    }


def main() -> int:
    try:
        request = json.load(sys.stdin)
        result = asyncio.run(_run(request))
        json.dump(result, sys.stdout, ensure_ascii=False, separators=(",", ":"))
        sys.stdout.write("\n")
        return 0
    except Exception as exc:  # runner boundary: Node owns user-visible handling
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
