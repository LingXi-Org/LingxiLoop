# Issue 331: incomplete answers

Written before the new isolated regression or product edits. All fixtures are
synthetic. The user screenshot and private conversation contents are not copied.

## Evidence boundary

The screenshot shows an incomplete run with a promise to continue instead of the
requested deliverable. It does not identify the provider failure, a token limit,
cancellation, a correction-budget decision, or deleted SSE content. Original-run
attribution is pending the sole publisher's scoped, sanitized diagnosis.

Runtime 3.8.2 deliberately shares a bounded no-progress correction allowance
across protocol and content corrections. Two outer protocol corrections followed
by a missing-content finding can commit the last valid candidate as partial.
That policy is an existing safety boundary, not established as a defect by this
report. This change must neither increase nor split that allowance.

## Failures to guard

- A syntactically valid answer containing only a promise can be retained after
  correction exhaustion. It must remain partial, never satisfied, and must not
  claim a visualization was delivered.
- A text-only partial or blocked result can hide its incomplete status because
  UI attention is gated on an empty body or an obsolete lifecycle combination.
- A terminal result without body content can have no usable recovery action.
- Refresh/history replay can lose, duplicate, or relabel the retained text, or
  accidentally resume generation and repeat tools or delivery.
- A recovery action can duplicate a user submission, reuse the old run, bypass
  read-only/access controls, or silently resume a cancelled run.
- Fixing the incomplete state can regress satisfied results, explicit input or
  approval waits, cancellation, delivery errors, or retained real artifacts.

## Owning checks

Extend the published-worker/HTTP/local-PostgreSQL regression in
`visualize-incomplete-conversation.test.ts` with a promise-only candidate after
two protocol failures. Keep the existing bounded partial outcome. Check the
actual public state, ledger, durable message and replay; assert no visualization
write, extra generation, or repeated delivery. Use the official browser engine
for visible terminal state and recovery behavior, with synthetic fixtures only.

Production verification remains with the sole publisher. Needed fields, without
content: pseudonymous call/attempt identity, purpose, error category/retryability,
correction count/protocolRepairs, lifecycle/goalOutcome, effective budget and
consumption dimensions, tool-effect count, accepted result and delivery identity,
and public-text part identities/purpose/length. Do not return raw prompts, gaps,
trace payloads, private titles, credentials, or screenshots.
