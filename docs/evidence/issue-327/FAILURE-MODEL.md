# Issue 327: conversation creation

Before implementation, the owning failure cases are:

- The permission resolver gives an active organization administrator access to a project without an explicit project_memberships row. The conversation eligibility query nevertheless requires that row for the automatically included caller, causing 400 invalid_members even when all six selected agents are valid.
- Six selected ordinary agents must create a seven-member group, including the human caller; participant IDs, company, project, conversation members, binding and channel initialization must agree.
- Only the caller gets the existing administrator access rule. An administrator selected as a peer without project membership, departed/managed/foreign participants, and revoked callers must remain rejected before writes.
- Single human and single agent starts retain their existing direct/learning semantics; human and mixed groups remain valid.
- A lost creation response or concurrent retry must reuse the committed group for one request key, even across API/application instances. A different payload with the same key must fail clearly. A new key must allow an intentionally new group. Keys must be isolated by organization, project and caller.
- Failure before binding commit must roll back conversation creation. Failure in external channel initialization after commit must retain the durable binding for reconciliation and permit an idempotent retry.
- The dialog must retain selections and its request key after network/server failures, provide a clear selection validation error, avoid double submission, and ignore stale completions after unmount or a workspace/user change.

Read-only diagnosis: normal explicit-member six-agent creation is supported by the product. The production screenshot alone does not establish its HTTP failure code or the caller's membership shape. The administrator mismatch is established in source and reproduced by the isolated API regression, not inferred from production data.
