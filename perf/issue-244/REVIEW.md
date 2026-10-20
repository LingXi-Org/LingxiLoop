# Independent review and late-create correction

Read-only review of `e49a865ceb5418796431ae7305b411e19efae84a` against `a29060a7`
found one P2, no P0/P1: an aborted old POST may continue server-side after a retry
is ready. The server's existing same-instance replacement then revokes the new
page. The initial transport fixture aborted before committing and did not cover it.

Correction: use a fresh UUID in the existing acquisition `instanceKey` field on
each POST; keep the original target identity for retained DOM/session addressing.
No new protocol, server API or permission. Same-page state/follow-up authorization
and the server's 64-capability quota remain intact.

The new fixture implements same-instance revocation and can continue a create
after client disconnect. A times out; B becomes ready; only then A commits.
The exact sequence failed before the correction and passed afterward through
a real guest state save. Evidence deliberately shows two active server fixture
pages: the lost old response cannot be revoked client-side. Existing 24h expiry
still applies; repeated losses can cause 429 near quota. This is not reported as
confirmed cleanup or weakened by increasing the quota.

The reviewer judged the proposed isolation sufficient, with those non-blocking
availability limits. The final correction still receives exact-commit review
before handoff. No production or provider operation was used.
