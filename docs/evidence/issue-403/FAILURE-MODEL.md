# Cross-tab session synchronization (#403)

Base: 55f62548887b03dbc0321e54e0ca2036a77639b3. This is a client lifecycle defect, not proof of the original #382/#389 incident or a server authorization bypass.

Failure modes before implementation:
- A retained tab never subscribes to Better Auth session refresh; another tab changes the shared cookie while cached teacher content stays mounted.
- A late product /session response restores A after A→B or A→B→A; abort alone must also fence a fetch mock/transport that ignores cancellation.
- The same principal retains its session but loses membership/teacher/admin capability; a successful product-session refresh must invalidate the old authorized subtree.
- Routine refresh with unchanged identity/permissions must preserve mounted drafts; checking identity is not an instruction to discard every form on focus.
- An old 401 must not sign out a newly accepted identity. Ordinary resource 403 must remain a permission error, not a global logout policy.
- Logout must cancel outstanding synchronization; StrictMode cleanup must fence late results without losing the next subscription.

Use the installed Better Auth 1.7.2 useSession lifecycle (storage, visibility, online; default polling disabled). Its session token is never copied or logged. Product /session remains the authority for application user and company permissions. Clear/unmount on actual session identity change; atomically commit the product session and bump an authorization epoch when identity or company authorization changes. Existing teardown, navigation cleanup and WS generations remain in place.

No business APIs, server permissions, credentials, WS authorization or production data change. Existing HTTP denial coverage remains. Tests use synthetic identities and deferred promises; real two-tab browser verification is a separate pending gate.

## Verification and deliberate boundary

- Original AuthGate render regression: a synthetic signed-out observation still rendered `teacher-private-draft`; the old-source red is retained locally. The new gate hides it in that same render, before effects reconcile the application store.
- Existing HTTP regression extended: an aborted /session response returning 401 cleared the current identity (2 clears instead of 1). Fixed by honoring its AbortSignal; ordinary resource 403 remains unchanged.
- Focused tests: 9/9 pass, including the installed Better Auth event lifecycle, A→B→A late responses, current/old/cancelled 401, ordinary 403, atomic identity changes, same-user company authorization changes, unchanged refresh, and existing WebSocket generation tests. Lint: 11 files pass. These are synthetic unit/SSR checks, not full browser authentication or production qualification.
- Initial unknown session, a new session key, explicit unauthenticated observation or verification error hides the previous authorized subtree. An already accepted same-key routine `isRefetching` retains its previous snapshot and unsaved form state until the trusted result arrives. This is a bounded revalidation window, not new authorization or a claim of instantaneous cross-tab revocation. Every backend request still applies its existing permission checks. No new polling or global 403 logout is introduced.
- Web typecheck/CI and official two-context browser verification remain pending at this source freeze. The original #382/#389 reports remain unlocated; no claim of unauthorized server writes is made.

Runtime reuse: the pinned Better Auth 1.7.2 `useSession` mounts its existing session atom. Its `session-refresh` lifecycle listens to storage, visibility and online events, while its default polling interval is zero. The adapter only cancels and fences one product /session request per observation. Existing App remount, auth teardown, navigation reset, request abort and WS generation paths own cleanup. No session tokens or real user records are used in evidence.

## Independent-review corrections

The first candidate e5c144ca was not qualified. Independent review found three P2 defects: an ordinary current401 could leave the gate waiting forever; an in-flight product-session success could undo an external invalidation; and Retry could reveal quarantined content before the product check completed. Their red regressions are preserved.

The correction latches a current resource401 revalidation request until a trusted session is accepted, so repeated denial cannot create an automatic loop. Product `/session` failures are owned by the synchronizer rather than recursively triggering the general HTTP401 handler. A current product401 clears application identity and shows Retry; an ordinary resource403 is unchanged. Successful and failed callbacks also compare the authorization epoch, covering invalidation before React effect cleanup. A failed gate remains quarantined through Retry and clears only after successful current product verification (or a confirmed signed-out observation). The effect observes the official snapshot, including a same-key refresh whose intermediate state React may batch away.

CI40077033989 on e5c144ca failed at web lint/tests. Its annotations only supplied exit1. A single attempt to retrieve that job's raw log returned Forbidden with zero bytes; no alternate path or retry was used. Local full lint reproduced noChildrenProp in the final SSR test typing adjustment. Ordinary JSX fixes that test-only error without changing assertions.

Corrected owning web run: 137/137 PASS in 29.99s (the normal web smoke plus changed auth tests); full web lint passed. After the final snapshot-dependency delta, the two Gate tests and official Better Auth observation test passed 3/3. Original red, missing-fixture-export attempts, CI failure and earlier 9-test result remain distinct; they are not recast as one successful run. Exact new CI and independent real two-context browser verification are still pending. No local browser or production session was run.

### Rejection ownership follow-up

The second review also covered two callers beyond the initial gate: current WebSocket4403 now passes the existing `session-rejected` reason to the same bounded reconciliation path (no authorization/close-code rule changed), and only `authApi.verifySession` opts into caller-owned `/session` rejection. Ordinary `authApi.me`, including invitation acceptance/login fallback, retains global current401 cleanup. Both boundaries failed their new assertions before the correction.

A current synchronous membership-validation rejection can itself clear the identity before throwing. That current failure still reaches the recoverable error UI; epoch fencing continues to discard responses invalidated externally. The additional negative failed before this correction. Final affected suite: 12/12 PASS; prior 137/137 owning web result remains a separate run. New exact CI and independent browser evidence remain pending.
