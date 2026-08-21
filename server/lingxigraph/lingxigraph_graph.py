"""LingxiLoop's communication graph on the LingxiGraph production Runtime.

The Runtime owns run identity, durable steering, safe-point consumption and
the persisted event stream. This module owns only product policy: translate a
message.new steering event into fresh conversation context and re-plan.
"""

from __future__ import annotations

import json
from typing import Any, TypedDict

from lingxigraph import END, START, Runtime, StateGraph

from lingxigraph_runner import _run_stream


class LoopGraphState(TypedDict, total=False):
    version: int
    runId: str
    tenantId: str
    agent: dict[str, str]
    trigger: str
    systemPrompt: str
    contextPrompt: str
    generation: int
    rerun: bool
    result: dict[str, Any]


def _apply_steering(state: LoopGraphState, events: tuple[Any, ...]) -> LoopGraphState:
    # Runtime state is exposed as an immutable mappingproxy. Nodes return a
    # state update instead of mutating the snapshot supplied by the Runtime.
    updated: LoopGraphState = dict(state)
    if not events:
        return updated
    additions: list[str] = []
    for event in events:
        if event.kind != "message.new":
            continue
        payload = dict(event.payload)
        additions.append(
            "[Runtime steering: message.new]\n"
            + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        )
    if additions:
        updated["contextPrompt"] = (
            str(updated.get("contextPrompt", "")).rstrip()
            + "\n\nNew messages durably delivered while this run was active:\n"
            + "\n".join(additions)
        )
    return updated


async def reason(state: LoopGraphState, runtime: Runtime[Any]) -> LoopGraphState:
    request = _apply_steering(state, runtime.drain_steering())
    generation = int(state.get("generation", 0)) + 1
    request["generation"] = generation
    request["rerun"] = False

    async for event in _run_stream(request):
        # Provider streaming is an application safe point. If input arrives,
        # close this speculative generation, durably consume the steer, and
        # re-plan inside the SAME Runtime run instead of starting a second turn.
        steering = runtime.drain_steering()
        if steering:
            runtime.emit("message.reset", {"generation": generation})
            updated = _apply_steering(request, steering)
            updated["rerun"] = True
            updated.pop("result", None)
            return updated

        if event.get("type") == "message.delta":
            runtime.emit("message.delta", {**event, "generation": generation})
        elif event.get("type") == "result":
            request["result"] = event["result"]

    # Close the race between the provider's final token and node completion.
    steering = runtime.drain_steering()
    if steering:
        runtime.emit("message.reset", {"generation": generation})
        updated = _apply_steering(request, steering)
        updated["rerun"] = True
        updated.pop("result", None)
        return updated

    if "result" not in request:
        raise RuntimeError("LingxiGraph model stream ended without a structured result")
    return request


def route(state: LoopGraphState) -> str:
    return "reason" if state.get("rerun") else END


builder = StateGraph(LoopGraphState, name="lingxiloop-agent", version="1.0.0")
builder.add_node("reason", reason, timeout=400)
builder.add_edge(START, "reason")
builder.add_conditional_edges("reason", route)

graph = builder.compile()
