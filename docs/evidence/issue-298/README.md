# Conversation delivery repair

A synthetic reproduction against the formally published LingxiOS 3.8.0 package
found that an ordinary public conversation could commit a partial answer after
content review correctly identified a missing interactive deliverable. The
conversation flag skipped bounded repair, even without any peer assignment.
Explicit visualization authoring activation already invoked the separate native
resource verifier and repaired the omission. `before-3.8.0.json` records those
aggregate results; it contains no original user data.

The upstream correction is tracked in
[LingxiOS #42](https://github.com/LingXi-Org/LingxiOS/issues/42) and
[PR #43](https://github.com/LingXi-Org/LingxiOS/pull/43).
Ordinary missing deliverables now use the existing correction/root budgets.
The optional public policy hook only defers content repair for an actual public
peer handoff. Product resolution uses the existing mention parser, current host
agent roster and frozen audience. A standalone inline handle remains supported,
matching actual assistant-message dispatch; blockquotes, code blocks/snippets,
links, self/human mentions, aliases and unauthorized members do not defer repair.
The hook does not grant access, dispatch work or bypass resource checks.

Known terminal partial/blocked statuses are preserved by the public trace.
An actual execution end does not mean the requested goal was met. Waiting work
has no fabricated end and missing historical timestamps remain missing.

The controlled integration uses local PostgreSQL, the published Worker and
OpenAI HTTP driver, and a local synthetic HTTP provider. Two malformed purpose
envelopes reproduce red failed model attempts followed by recovery, demonstrating
why those red attempts alone cannot establish a supplier outage. Ordinary and
explicitly activated omissions must repair through save/read/final reference;
repeated omissions must stop at the correction budget and remain partial. A
quoted peer cannot suppress repair, while an actual peer handoff commits and
creates authorized peer work. Process commentary must stay outside the answer
in the persisted projection.

Reproduce with Node 22, the repository's local PostgreSQL/Redis services, and
`node e2e/server/visualize-incomplete.mjs`. The runner only uses its named local
test database and synthetic provider. It never reads production credentials.

Migration 0053 is provenance-only: exact runtime 3.8.0/native14/product52 becomes
runtime 3.8.1/native14/product53. All historical checksums and native objects stay
unchanged. Fresh installs, source/target corruption, ledger rollback, no native
DDL, repeat startup and exact release-plan guards have dedicated regressions.
The new release profile retains all four accepted source identities, seed
verification, drain, migration-once and Web-before-Worker rollout. Unknown
operation outcomes stop; there is no automatic retry or rollback.

This is controlled evidence, not acceptance of the original screenshot case.
Original attribution needs its run ID (or conversation link plus message ID),
access restored through the authorized production entrypoint, and specific
read authorization for that case. Production MCP remains denied with HTTP 403 /
Cloudflare 1010; this task has made no production requests or deployments.
The previous production receipt is not a real-time version check.
