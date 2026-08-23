# Shared Canvas architecture

LingxiLoop Canvas follows one invariant: **shared state, isolated execution**.

The shared boundary contains only workspace-scoped Canvas records:

- `canvases` identifies the workspace Canvas.
- `canvas_frames` stores typed frame geometry, content and revision metadata.
- `canvas_presence` stores short-lived human/Agent working status.
- `canvas_comments` and `canvas_activity` provide discussion and audit history.

Human mutations use authenticated `/api/canvas` routes. Agent mutations use the
Agent OS Host Bridge (`canvas.get`, `canvas.create_frame`,
`canvas.update_frame`, `canvas.append_content`, `canvas.delete_frame`, and
`canvas.set_status`). The bridge retains Agent OS tenant authorization, work
leases and the durable idempotency ledger.

Postgres is authoritative. Each committed mutation publishes a small
tenant-tagged event on the existing Redis bus, which the existing `/ws` server
fans out to connected workspace members. Reconnects reconcile with a fresh
Canvas snapshot.

Frame types are deliberately open beyond HTML: `html`, `markdown`, `document`,
`image`, and `artifact` are first-class values. HTML renders in a scriptless
sandboxed iframe; it never executes in the LingxiLoop application origin.

Canvas introduces no collaboration container, MCP service, Docker runtime,
Screen/X11 session, browser profile, or shared filesystem. Agent OS kernels and
their Agent Homes remain isolated exactly as before.

The interaction and data model were independently designed after studying
Doop's public architecture. No Doop source code or service is included, keeping
LingxiLoop's MIT license boundary intact.
