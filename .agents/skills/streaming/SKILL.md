---
name: streaming
description: Implement or debug assistant-ui streaming endpoints, wire formats, partial text, or streamed tool calls.
---

# assistant-ui Streaming

Inspect the installed package and the relevant `references/` protocol file before editing.

- Reuse the existing stream format and transport. Use AI SDK UI streams when the app already uses AI SDK; use `assistant-stream` only for a custom backend.
- Preserve event order, cancellation, errors, completion, and tool-call identifiers.
- Validate the actual response content type and a focused streamed text/tool-call path.
- For body/process/attention ownership, viewport intent and reconnect semantics, follow [learning experience](../assistant-ui/references/learning-experience.md). Retain the same source/run/part identities through streaming and completion; record observed paint metrics separately from functional checks.
