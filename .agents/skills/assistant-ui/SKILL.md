---
name: assistant-ui
description: Choose or review assistant-ui architecture, packages, and runtime boundaries. Use for cross-cutting chat UI decisions; use focused sibling skills for implementation.
---

# assistant-ui

Inspect the installed package version and read only the relevant file under `references/` before implementation; external APIs may have changed.

- Use this skill to select a runtime or explain the architecture, not for a focused component, tool, markdown, or streaming change.
- Prefer the existing integration and public API. Do not add an adapter, state layer, or package until the current one cannot satisfy the task.
- Route focused work to `runtime`, `primitives`, `tools`, `streaming`, or `markdown`.
- For learning conversations, approvals, recovery and artifacts, read [learning experience](references/learning-experience.md): choose the existing owner, preserve operation identity and verify the learner's next action. Follow its linked layout/copy rules for the affected surface.
