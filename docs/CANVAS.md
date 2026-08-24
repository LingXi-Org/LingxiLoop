# Shared Canvas architecture

LingxiLoop Canvas follows one invariant: **shared state, isolated execution**.

The shared boundary contains only task-workspace-scoped Canvas records:

- `canvases` identifies a durable learning-task workspace and its source conversation, trigger, goal, initiator, and lifecycle. A tenant may retain many historical workspaces.
- `canvas_frames` stores typed frame geometry, content and revision metadata.
- `canvas_agent_assignments` and `canvas_assignment_dependencies` store the Agent roster, stable colors, work zones, cursor/focus, results, and dependency DAG.
- `canvas_presence` stores short-lived human/Agent working status and cursors.
- `canvas_comments` and `canvas_activity` provide discussion and audit history.

Human frame mutations use authenticated `/api/canvas` routes. There is no human
agent picker, assignment composer, or workspace-creation control in Canvas; the
learning Agent decides when a workspace helps and allocates its capable peers.
Agent mutations use the
Agent OS Host Bridge (`canvas.available_agents`, `canvas.start_workspace`,
`canvas.add_agents`, `canvas.get`, `canvas.create_frame`,
`canvas.update_frame`, `canvas.append_content`, `canvas.delete_frame`, and
`canvas.set_status`). The bridge retains Agent OS tenant authorization, work
leases and the durable idempotency ledger.

`start_workspace` returns an internal runtime directive. It tells the initiating
runtime to persist its session and defer safely after the live Canvas card
exists. Dependency-free assignments enter the durable queue immediately.
Workers write final text to their assignment instead of the conversation,
unlock downstream work, and eventually enqueue one `canvas_summary` work item
for the initiating Agent. Stopping the whole workspace suppresses that summary.

Postgres is authoritative. Each committed mutation publishes a small
tenant-tagged event on the existing Redis bus, which the existing `/ws` server
fans out to connected workspace members. Reconnects reconcile with a fresh
Canvas snapshot. Deltas carry timestamps and content revisions; clients ignore
older revisions. Content replacement uses `baseRevision` optimistic concurrency,
while append remains an atomic database operation.

Frame types are deliberately open beyond HTML: `html`, `markdown`, `document`,
`image`, and `artifact` are first-class values. HTML renders in a scriptless
sandboxed iframe; it never executes in the LingxiLoop application origin.

Canvas introduces no collaboration container, MCP service, Docker runtime,
Screen/X11 session, browser profile, or shared filesystem. Agent OS kernels and
their Agent Homes remain isolated exactly as before.

The interaction and data model were independently designed after studying
Doop's public architecture: stable identity colors, presence, task timelines,
ghost work frames, editor highlights, and a unified realtime event layer. No
Doop source code or service is included, keeping LingxiLoop's MIT license
boundary intact.
