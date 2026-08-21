"""LingxiLoop's communication-only model runner.

The production entry point is ``lingxigraph_graph.py`` on LingxiGraph's
durable Agent Server. The CLI below remains useful for focused model-contract
tests without PostgreSQL/Redis.

- `_run_stream()` — provider deltas projected into Runtime-native events.
- `main()` below — a stdin/stdout CLI kept for local, dependency-free
  smoke-testing of `_run()` without standing up the HTTP server.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from typing import Any, AsyncIterator, Mapping

import httpx

from lingxigraph import HumanMessage, create_agent
from lingxigraph.integrations.openai_compat import OpenAICompatChatModel
from lingxigraph.messages import AIMessage, SystemMessage


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
                    {"type": "object", "additionalProperties": False, "required": ["type", "title", "memberIds", "leaderId", "reason", "openingMessage"], "properties": {"type": {"const": "conversation.group.create"}, "title": {"type": "string", "minLength": 1}, "memberIds": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}}, "leaderId": {"type": "string", "minLength": 1}, "reason": {"type": "string", "minLength": 1}, "openingMessage": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "conversationId", "participantId"], "properties": {"type": {"enum": ["conversation.member.invite", "conversation.member.remove"]}, "conversationId": {"type": "string", "minLength": 1}, "participantId": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "conversationId"], "properties": {"type": {"const": "conversation.leave"}, "conversationId": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "to", "subject", "body"], "properties": {"type": {"const": "email.send"}, "to": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}}, "cc": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}}, "subject": {"type": "string", "minLength": 1}, "body": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "messageId", "body"], "properties": {"type": {"const": "email.reply"}, "messageId": {"type": "string", "minLength": 1}, "body": {"type": "string", "minLength": 1}, "cc": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "conversationId", "question", "options"], "properties": {"type": {"const": "poll.create"}, "conversationId": {"type": "string", "minLength": 1}, "question": {"type": "string", "minLength": 1}, "options": {"type": "array", "minItems": 2, "items": {"type": "string", "minLength": 1}}, "mode": {"type": "string", "enum": ["single", "multi"]}, "expiresInMinutes": {"type": "number", "exclusiveMinimum": 0}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "messageId", "optionIds"], "properties": {"type": {"const": "poll.vote"}, "messageId": {"type": "string", "minLength": 1}, "optionIds": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "messageId"], "properties": {"type": {"const": "poll.close"}, "messageId": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "title"], "properties": {"type": {"const": "document.create"}, "title": {"type": "string", "minLength": 1}, "content": {"type": "string"}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "documentId"], "properties": {"type": {"const": "document.read"}, "documentId": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "documentId", "find", "replace"], "properties": {"type": {"const": "document.update"}, "documentId": {"type": "string", "minLength": 1}, "find": {"type": "string", "minLength": 1}, "replace": {"type": "string"}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "documentId", "content"], "properties": {"type": {"const": "document.append"}, "documentId": {"type": "string", "minLength": 1}, "content": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "documentId", "conversationId"], "properties": {"type": {"const": "document.share"}, "documentId": {"type": "string", "minLength": 1}, "conversationId": {"type": "string", "minLength": 1}, "comment": {"type": "string"}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "conversationId", "toAgentId", "title"], "properties": {"type": {"const": "handoff.create"}, "conversationId": {"type": "string", "minLength": 1}, "toAgentId": {"type": "string", "minLength": 1}, "title": {"type": "string", "minLength": 1}, "note": {"type": "string"}, "sharedPaths": {"type": "array", "items": {"type": "string"}}, "browserTargets": {"type": "array", "items": {"type": "string"}}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "handoffId"], "properties": {"type": {"const": "handoff.complete"}, "handoffId": {"type": "string", "minLength": 1}, "note": {"type": "string"}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "conversationId", "kind", "summary", "payload"], "properties": {"type": {"const": "approval.request"}, "conversationId": {"type": "string", "minLength": 1}, "kind": {"type": "string", "enum": ["external_communication", "sensitive_or_destructive_action", "financial_or_irreversible_action"]}, "summary": {"type": "string", "minLength": 1}, "payload": {"type": "object", "required": ["action"], "properties": {"action": {"type": "object"}}}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "body", "kind"], "properties": {"type": {"const": "memory.note"}, "body": {"type": "string", "minLength": 1}, "kind": {"type": "string", "enum": ["fact", "preference", "instruction", "relationship"]}, "about": {"type": "string"}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "conversationId", "scope", "operation", "mode"], "properties": {"type": {"const": "autonomy.remember"}, "conversationId": {"type": "string", "minLength": 1}, "scope": {"type": "string", "minLength": 1}, "operation": {"type": "string", "minLength": 1}, "mode": {"type": "string", "enum": ["allow", "ask", "deny"]}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "screenId", "command"], "properties": {"type": {"const": "computer.exec"}, "screenId": {"type": "string", "minLength": 1}, "command": {"type": "array", "minItems": 1, "items": {"type": "string", "minLength": 1}}, "cwd": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "screenId", "path"], "properties": {"type": {"enum": ["computer.read_file", "computer.list_files"]}, "screenId": {"type": "string", "minLength": 1}, "path": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "screenId", "path", "content"], "properties": {"type": {"const": "computer.write_file"}, "screenId": {"type": "string", "minLength": 1}, "path": {"type": "string", "minLength": 1}, "content": {"type": "string"}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "screenId"], "properties": {"type": {"enum": ["computer.screenshot", "computer.screen.status", "computer.screen.wait_for_human"]}, "screenId": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "screenId", "url"], "properties": {"type": {"const": "computer.browser.open"}, "screenId": {"type": "string", "minLength": 1}, "url": {"type": "string", "minLength": 1}, "private": {"type": "boolean"}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "screenId"], "properties": {"type": {"const": "computer.browser.targets"}, "screenId": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "targetId", "url"], "properties": {"type": {"const": "computer.browser.navigate"}, "targetId": {"type": "string", "minLength": 1}, "url": {"type": "string", "minLength": 1}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "targetId", "x", "y"], "properties": {"type": {"const": "computer.browser.click"}, "targetId": {"type": "string", "minLength": 1}, "x": {"type": "number"}, "y": {"type": "number"}}},
                    {"type": "object", "additionalProperties": False, "required": ["type", "targetId", "text"], "properties": {"type": {"const": "computer.browser.type"}, "targetId": {"type": "string", "minLength": 1}, "text": {"type": "string", "minLength": 1}}},
                ]
            },
        },
    },
}


class UsageTrackingModel:
    """Wraps a `ChatModel` and records the usage of every `agenerate()` call.

    `create_agent()`'s structured-response node calls `model.agenerate()`
    directly and only returns the parsed value — its usage never reaches the
    graph's output state. Wrapping the model (rather than relying on a
    model-level hook) captures usage from every call made during the run,
    including that one, without depending on optional constructor kwargs
    the pinned `lingxigraph[openai]` release may not support.
    """

    def __init__(self, inner: OpenAICompatChatModel) -> None:
        self._inner = inner
        self.model = inner.model
        self.calls: list[dict[str, Any]] = []

    async def agenerate(self, messages: Any, *, tools: Any = None, **kwargs: Any) -> AIMessage:
        response_format = kwargs.get("response_format")
        # LingxiGraph 2.0.1 passes its validation schema directly as
        # `response_format`.  OpenAI-compatible APIs do not accept a raw JSON
        # Schema there, and DeepSeek specifically only accepts
        # {"type":"text"} or {"type":"json_object"}.  Keep the full schema
        # for LingxiGraph's local validation/retry loop, but translate the
        # provider request to JSON mode and put the schema in the prompt.
        if _is_raw_json_schema(response_format):
            messages = [
                *messages,
                SystemMessage(
                    "Return only a JSON object matching this JSON Schema exactly. "
                    "Do not use Markdown fences. JSON Schema:\n"
                    + json.dumps(response_format, ensure_ascii=False, separators=(",", ":"))
                ),
            ]
            kwargs["response_format"] = {"type": "json_object"}
        response = await self._inner.agenerate(messages, tools=tools, **kwargs)
        self.calls.append({"model": self.model, "usage": _normalize_usage(response.usage)})
        return response


def _is_raw_json_schema(value: Any) -> bool:
    """Return true for a schema mistakenly used as an API response_format."""
    return (
        isinstance(value, Mapping)
        and value.get("type") == "object"
        and ("properties" in value or "required" in value)
    )


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

    model = UsageTrackingModel(OpenAICompatChatModel(
        model_name,
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        api_key=os.getenv("OPENAI_API_KEY"),
        timeout=float(os.getenv("LINGXIGRAPH_MODEL_TIMEOUT_SECONDS", "90")),
    ))
    graph = create_agent(
        model,
        tools=(),
        system_prompt=system_prompt,
        response_format=ACTION_SCHEMA,
        structured_retries=2,
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
        "modelCalls": model.calls,
    }


def _partial_json_string(raw: str, start: int) -> str:
    """Decode the complete prefix of a possibly unfinished JSON string."""
    out: list[str] = []
    i = start
    escapes = {'n': '\n', 'r': '\r', 't': '\t', 'b': '\b', 'f': '\f', '"': '"', '\\': '\\', '/': '/'}
    while i < len(raw):
        char = raw[i]
        if char == '"':
            break
        if char != '\\':
            out.append(char)
            i += 1
            continue
        if i + 1 >= len(raw):
            break
        escaped = raw[i + 1]
        if escaped == 'u':
            value = raw[i + 2:i + 6]
            if len(value) < 4 or any(c not in '0123456789abcdefABCDEF' for c in value):
                break
            out.append(chr(int(value, 16)))
            i += 6
            continue
        out.append(escapes.get(escaped, escaped))
        i += 2
    return ''.join(out)


def _message_send_prefixes(raw: str) -> list[tuple[int, str, str]]:
    """Return every message.send action whose body has begun streaming."""
    import re
    found: list[tuple[int, str, str]] = []
    marker = re.compile(r'"type"\s*:\s*"message\.send"')
    for index, match in enumerate(marker.finditer(raw)):
        tail = raw[match.end():]
        conversation = re.search(r'"conversationId"\s*:\s*"', tail)
        body = re.search(r'"body"\s*:\s*"', tail)
        if not conversation or not body or body.start() < conversation.start():
            continue
        conversation_id = _partial_json_string(tail, conversation.end())
        body_prefix = _partial_json_string(tail, body.end())
        if conversation_id:
            found.append((index, conversation_id, body_prefix))
    return found


async def _run_stream(request: Mapping[str, Any]) -> AsyncIterator[dict[str, Any]]:
    """Run the production communication model as a real provider token stream.

    The final structured object remains authoritative; intermediate events only
    expose prefixes of message.send bodies for the chat presentation layer.
    """
    if request.get('version') != 1:
        raise ValueError('request version must be 1')
    agent = request.get('agent')
    if not isinstance(agent, Mapping):
        raise ValueError('agent is required')
    model_name = str(agent.get('model') or '').strip()
    system_prompt = str(request.get('systemPrompt') or '').strip()
    context_prompt = str(request.get('contextPrompt') or '').strip()
    if not model_name or not system_prompt or not context_prompt:
        raise ValueError('agent.model, systemPrompt and contextPrompt are required')

    schema_prompt = (
        'Return only one JSON object matching this JSON Schema exactly. '
        'Keep each message.send field order as type, conversationId, body so its body can be streamed. '
        'Do not use Markdown fences. JSON Schema:\n'
        + json.dumps(ACTION_SCHEMA, ensure_ascii=False, separators=(',', ':'))
    )
    base_url = os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1').rstrip('/')
    headers = {'authorization': f"Bearer {os.getenv('OPENAI_API_KEY', '')}", 'content-type': 'application/json'}
    payload = {
        'model': model_name,
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'system', 'content': schema_prompt},
            {'role': 'user', 'content': context_prompt},
        ],
        'response_format': {'type': 'json_object'},
        'stream': True,
        'stream_options': {'include_usage': True},
        # Without any repetition control, this model call was observed
        # falling into genuine autoregressive repetition loops mid-generation
        # ("我在我在我在...待待待命...专门专门专门专门专门...") — a real degenerate
        # sampling failure, not a bug in the delta diffing below (which only
        # ever forwards exactly what body_prefix decodes to). Moderate
        # frequency/presence penalties are the standard mitigation and are
        # safe for JSON output: they discourage repeating the same token
        # within a single response but don't prevent the required JSON
        # structural keys, which each appear at most once per action.
        'frequency_penalty': float(os.getenv('LINGXIGRAPH_FREQUENCY_PENALTY', '0.4')),
        'presence_penalty': float(os.getenv('LINGXIGRAPH_PRESENCE_PENALTY', '0.2')),
    }
    raw = ''
    emitted: dict[int, str] = {}
    usage: Mapping[str, Any] = {}
    timeout = float(os.getenv('LINGXIGRAPH_MODEL_TIMEOUT_SECONDS', '90'))
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream('POST', f'{base_url}/chat/completions', headers=headers, json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith('data:'):
                    continue
                data = line[5:].strip()
                if not data or data == '[DONE]':
                    continue
                event = json.loads(data)
                if event.get('usage'):
                    usage = event['usage']
                choices = event.get('choices') or []
                delta = choices[0].get('delta', {}).get('content') if choices else None
                if not isinstance(delta, str) or not delta:
                    continue
                raw += delta
                for action_index, conversation_id, body in _message_send_prefixes(raw):
                    previous = emitted.get(action_index, '')
                    if not body.startswith(previous):
                        continue
                    addition = body[len(previous):]
                    if addition or action_index not in emitted:
                        emitted[action_index] = body
                        yield {'type': 'message.delta', 'actionIndex': action_index, 'conversationId': conversation_id, 'delta': addition}

    structured = json.loads(raw)
    if not isinstance(structured, Mapping):
        raise ValueError('model did not return a structured object')
    yield {
        'type': 'result',
        'result': {
            'version': 1,
            'status': structured['status'],
            'reason': structured['reason'],
            'actions': structured['actions'],
            'modelCalls': [{'model': model_name, 'usage': _normalize_usage(usage)}],
        },
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
