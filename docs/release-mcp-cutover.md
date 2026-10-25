# MCP deployment entry cutover

The authenticated administrator MCP at `/api/mcp` retains its existing token,
allowed-Origin, auth-administrator, ban-state and active business-link checks.
This change does not create users, grant a role, change D1 schema or add an
unauthenticated release route.

The existing `lingxiloop_komodo_stack_action` can deploy/start/stop/restart only
its existing allowlist. When the administrator Worker's binding
`RELEASE_CONTROLLER_ENABLED` is exactly `true`, every such action for
`lingxiloop-core-state`, `lingxiloop-app-a`, `server-b-ingress`,
`lingxiloop-app-b`, and `lingxiloop-knowledge-agent` fails before any Komodo
request with `RELEASE_CONTROLLER_OWNS_TARGET`. These include the main runtime,
core persistence, gateway and Notebook/WuKong-owned deployment surfaces.

`uptime` keeps its existing operation capability. The read-only
`lingxiloop_komodo_targets`, `lingxiloop_komodo_inspect`,
`lingxiloop_komodo_updates` and `lingxiloop_komodo_logs` remain available.
Unrelated projects are not added to or removed from the allowlist. An unset or
false flag retains the previous Komodo mutation behavior until actual handoff.

Six new structured tools use the same version-1 release API as the operator CLI:

| MCP tool | Fixed controller request |
| --- | --- |
| `lingxiloop_release_plan` | `POST /v1/plan` with the shared-validator manifest |
| `lingxiloop_release_submit` | `POST /v1/releases` with an immutable manifest |
| `lingxiloop_release_get` | `GET /v1/releases/:releaseId` |
| `lingxiloop_release_watch` | `GET /v1/releases/:releaseId/events?after=:cursor` |
| `lingxiloop_release_resume` | `POST /v1/releases/:releaseId/resume` |
| `lingxiloop_release_recover` | `POST /v1/releases/:releaseId/recover` |

Each call additionally checks `/api/admin/session` through the existing signed
product API operation. A revoked/deleted/suspended business administrator cannot
use the release binding merely because their auth account still has an admin
role. Mutation audit/idempotency uses existing `control_audit` rows; submit
fingerprints the complete manifest, and administrator authorization is checked
before an audit replay can return.

Configuration uses optional private Worker bindings, without altering generated
`Env` declarations: prefer `RELEASE_SERVICE` bound to the release Worker, or set
`RELEASE_API_URL` to a fixed HTTPS root with no credentials/query/fragment.
`RELEASE_API_TOKEN` authorizes plan/submit/get/watch; `RELEASE_ADMIN_TOKEN` is
used only for resume/recover and belongs only in the administrator Worker and
approved secret store. Neither credential is a tool argument or returned
value. The existing MCP redactor also explicitly knows both binding values.
CI continues to use its API-only token and never receives the admin token.

Submit/resume/recover require the exact enabled flag, preventing a new
controller mutation while the old default Komodo mutators are still live.
Plan/get/watch can be used for preparation once their private bindings exist.
The client has a 30-second request bound, no automatic side-effect retry, fixed
paths and explicit redirect rejection. `watch` returns one finite event batch;
callers reconnect with its cursor. A timeout is an uncertain request outcome:
query the release by ID instead of assuming a production failure. A queued
submission and an MCP audit success are not production `accepted` evidence.

Code merge alone does not retire the old deployment entry. Retirement requires
actual control-plane Worker upload/deployment with the private service/secret
bindings, verification of administrator checks and release API reachability,
and the cutover flag enabled after execution ownership has transferred. This
module does not deploy, change routes or alter an existing production pointer.

Verification covers disabled legacy behavior, all four blocked actions across
the five protected targets, unaffected Uptime and inspection, the existing MCP
authorization boundary, product-admin denial before any release request, all
six method/credential mappings, redaction and fixed origin/redirect checks.
