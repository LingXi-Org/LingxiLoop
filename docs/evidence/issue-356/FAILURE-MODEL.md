# Delivered visualization reference identity

Recorded before implementation; all verification inputs are synthetic.

- A delivered run snapshot can precede its IM echo or restore without the echo. Its UI `run-*` ID is not an IM message ID; page acquisition must use the verified acceptance's canonical ID.
- A later result/request/fence must not inherit the earlier result's source, IM sequence or message aliases. Reordered snapshots must not downgrade a valid reference for the same result.
- An acceptance must match tenant, conversation, agent, run, result, request version, fence, payload and actual accepted echo. Pending/unknown, forged, ambiguous, cross-room and cross-tenant records cannot enable a page.
- An obsolete asynchronous identity read cannot attach its receipt after cancellation, replacement or revision.
- Missing identity must preserve useful prose and report delivery reconciliation without making a doomed request or falsely claiming the interactive view is ready.
- Existing server page admission still verifies the actual delivered assistant reference, membership, resource ownership and current document version. An old message cannot authorize a new run's overwritten document.
- Browser replay and legitimate owner changes retain the existing source-keyed page lifetime. A delayed old acquisition cannot take over the new owner.

Production symptom correlation is separate from these code-level regressions; this work does not access or replay private conversations.
