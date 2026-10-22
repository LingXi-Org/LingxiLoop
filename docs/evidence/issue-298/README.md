# Conversation delivery repair

A synthetic reproduction against the formally published LingxiOS 3.8.0 package
recorded an ordinary public conversation committing a partial answer after
content review correctly identified a missing interactive deliverable. Source inspection and separate upstream regressions without preceding protocol errors proved that the conversation flag skipped bounded repair even without a peer assignment.
Explicit visualization authoring activation already invoked the separate native
resource verifier and repaired the omission. `before-3.8.0.json` records those
aggregate results; it contains no original user data.

The upstream correction was formally published as runtime 3.8.1 from commit
`562d73b88cee9885833f9ac9fd889967f27f13f6` after the exact-main
[release gates](https://github.com/LingXi-Org/LingxiOS/actions/runs/39718986580)
and [package publication](https://github.com/LingXi-Org/LingxiOS/actions/runs/39720003427)
succeeded. That 3.8.1 adoption verified the root/server locks against the official registry.
`formal-package-3.8.1.json` records the installed public release identifiers and native
schema digest. The correction is tracked in
[LingxiOS #42](https://github.com/LingXi-Org/LingxiOS/issues/42) and
[PR #43](https://github.com/LingXi-Org/LingxiOS/pull/43).
Ordinary missing deliverables now use the existing correction/root budgets.
The optional public policy hook only defers content repair for an actual public
peer handoff. Product resolution uses the existing mention parser, current host
agent roster and frozen audience. A standalone inline handle remains supported,
matching actual assistant-message dispatch; blockquotes, code blocks/snippets,
links, self/human mentions, aliases and unauthorized members do not defer repair.
The hook does not grant access, dispatch work or bypass resource checks.

The formal 3.8.1 product integration exposed a separate remaining SSE defect:
the direct reader preserved partial/blocked, but realtime phase matching still
expected unknown and discarded the authorized terminal trace.
`sse-3.8.1.json` preserves the controlled failure separately from the successful
Worker receipts. [LingxiOS #45](https://github.com/LingXi-Org/LingxiOS/issues/45)
and [PR #44](https://github.com/LingXi-Org/LingxiOS/pull/44) track the minimal
3.8.2 correction; fresh and beyond-last-event terminal SSE regressions failed
0/2 before the fix and the owning source suite passes 9/9 after it.
The correction was formally published as 3.8.2 from
`64f2adbac3310280a9bd776531d464e6acb48686`, after the exact-main
[release gates](https://github.com/LingXi-Org/LingxiOS/actions/runs/39723081460)
and [package publication](https://github.com/LingXi-Org/LingxiOS/actions/runs/39723816738)
succeeded. The earlier 3.8.1 receipts remain historical failure/success evidence.

Known terminal partial/blocked statuses are preserved by the public trace.
An actual execution end does not mean the requested goal was met. Waiting work
has no fabricated end and missing historical timestamps remain missing.

The controlled integration uses local PostgreSQL, the published Worker and
OpenAI HTTP driver, and a local synthetic HTTP provider. Malformed purpose envelopes reproduce red failed model attempts followed by recovery, demonstrating why those red attempts alone cannot establish a supplier outage. Two protocol corrections without new progress also consume the existing shared correction budget: a subsequent missing deliverable must remain partial. The before receipt alone therefore cannot isolate the conversation-bypass defect. This budget is not widened; explicit authoring activation is a real progress checkpoint. Ordinary and
explicitly activated omissions must repair through save/read/final reference;
repeated omissions and protocol-budget exhaustion must stop at the correction budget and remain partial. A
quoted peer cannot suppress repair, while an actual peer handoff commits and
creates authorized peer work. The first positive handoff fixture used a 30-second
root budget, which correctly failed native deadline admission: a child call and
closing call each reserve the default 120-second recovery envelope. The fixture
now grants a 300-second root budget; product budgets, approval and child admission
remain unchanged. This fixture correction does not grant extra content/protocol
correction attempts. Process commentary must stay outside the answer
in the persisted projection.

Reproduce with Node 22, the repository's local PostgreSQL/Redis services, and
`node e2e/server/visualize-incomplete.mjs`. The runner only uses its named local
test database and synthetic provider. It never reads production credentials.

Migration 0053 is provenance-only: exact runtime 3.8.0/native14/product52 becomes
runtime 3.8.2/native14/product53. All historical checksums and native objects stay
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

The formal 3.8.1 memory implementation keeps the exact embedding model ID in
its cache key, alongside endpoint, dimensions and optional index version.
Retrieval also matches stored model key, actual model and vector cardinality;
changed models do not reuse old vectors, and stale queued jobs become obsolete.
The unchanged owning semantic-memory regression (1/1) and embedding driver
regressions (3/3) passed against the released upstream source. No index was
rebuilt or deleted; the separate model-unification knowledge migration remains
plan-only. This check does not claim live production configuration changed.

Validation before the final 3.8.2 adoption: the formal 3.8.1 Worker fixture passed
all six scenarios and blocked direct-reader checks. Six migration/trace files
produced 43/45 passes; failures were the genuine SSE defect above and a local
test cleanup race from FORCE-dropping just-closed PostgreSQL sessions. The
cleanup now waits for only its own fixture sessions and drops without FORCE;
the three affected provenance files then passed 6/6. The historical migration
file and Pro embedding HTTP/ledger path passed. No failed check was relabelled
as successful. Final 3.8.2 consumer verification is recorded below.

Final formal 3.8.2 consumer verification passed on the branch containing merged
PR303 (`f62a6c897be705e60c3984508579cf5751b891d3`):

- Independent root `npm ci`; root/server exact 3.8.2 locks, registry integrity,
  public compiled `releaseVersions` and unchanged native schema digest verified
  in `formal-package-3.8.2.json`.
- Real Worker/PostgreSQL/HTTP fixture: all six scenarios plus blocked reader
  pass in `after-3.8.2.json`; actual terminal intervals survive viewer refresh.
- Five owning integration files pass 8/8 with no skips: 0051/0052/0053 source,
  rollback, corruption and native-object preservation; native live/first-read,
  actual completion, terminal SSE beyond-last-event replay, reload and access
  revocation; Pro embedding HTTP capture/SQL/scoped trace. The previously failing
  native SSE assertion passes unchanged against the formal 3.8.2 package.
- Server and Web typechecks, server lint, version synchronization and diff checks
  pass. Offline release guards pass 57/57; the exact 0053 profile test passes.
  Prior 3.8.0/3.8.1 historical migration evidence was preserved; unrelated full
  suites were not repeated.

0053 SQL SHA256 is
`733e035ba5de5aa5a9142c516e0364f83fe24e6dc0937e6045a89078371529dd`.
These checks used a new, dedicated 3.8.2 test database; the earlier 3.8.1 fixture
database and its failure receipt remain intact. Native memory/cache implementation
and its owning tests are byte-identical between the reviewed 3.8.1 and 3.8.2
sources. The candidate is runtime 3.8.2/native14/product53; production provenance
has not been read or changed, and original-case acceptance remains outstanding.
