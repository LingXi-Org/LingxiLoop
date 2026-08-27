# LingxiLoop Review Contract

Use this reference for substantive reviews. Apply only the sections reached by the diff.

## Sources of truth

- `README.md`: current runtime boundary, authoritative stores, local verification, and deployment posture.
- `CONTRIBUTING.md`: required gates and coding conventions.
- `docs/COORDINATION.md`: wake routing, durable work, leases, session isolation, stop/steer, approvals, and recovery.
- `docs/RUNTIME_EVENT_STREAM.md`: event visibility, previews, durable final messages, and control-plane behavior.
- `docs/CANVAS.md`: shared state with isolated execution, revisions, Host Bridge actions, and realtime reconciliation.
- `docs/RELEASE.md` and `docs/SHIPPING.md`: one-way cutover, digest-pinned release, evidence, smoke, and rollback.
- `docs/open-notebook-native.md`, `third_party/open-notebook/UPSTREAM.md`, and nested `AGENTS.md`: native scope isolation and vendored-source provenance.

When prose and implementation disagree, identify the current shipped behavior and the owning contract; do not silently choose one.

## Mandatory risk surfaces

### Tenant and trust boundaries

- Derive tenant scope from authenticated or service-bound context, not a client-supplied company identifier.
- Constrain tenant-owned reads, writes, joins, caches, events, and idempotency records by `company_id` or an equivalent owning relationship.
- Check negative authorization paths and cross-tenant identifiers, not only the happy path.
- Treat webhooks, model/tool JSON, retrieved knowledge, attachments, and external provider data as untrusted.

### Agent OS and messaging

- Keep the model-visible tool surface exactly strict `ipython`; product actions flow through the preloaded typed `loop` SDK.
- Keep WuKongIM authoritative for chat content, ordering, read state, and offline synchronization. PostgreSQL may hold control-plane projections and durable work.
- Preserve `{companyId, agentId, channelId, threadRootClientMsgNo?}` session isolation.
- Require a current lease token and fence for worker mutations. Trace cancellation, steering, preemption, expiry, and retry races.
- Preserve deterministic external identities: durable work id as run id, stable cell/call identity, and idempotency keys reused after recovery.
- Publish exactly one durable final message. Treat model deltas and activity as previews, and keep raw Python internal or redacted.
- Route every cloud LLM call through the tracked ledger path, including streaming completion accounting.

### Persistence and v1 bootstrap

- Use parameterized SQL, transactions for multi-write invariants, and durable idempotency for retryable side effects.
- Keep canonical DDL in `server/src/db/schema.sql` and update `bootstrap.ts` completeness checks with required objects.
- Verify only an empty database is initialized and legacy or incomplete databases fail with reset guidance; do not add runtime migrations or startup backfills.
- Verify Web, Worker, and Agent OS startup never creates or alters schema.

### Build, release, and vendored code

- Treat workflow, lockfile, Docker, package, and release-script changes as credentialed supply-chain changes.
- Preserve version synchronization, immutable image/tag assumptions, packaged Electron boundaries, and rollback evidence.
- Under `third_party/open-notebook`, follow the closest `AGENTS.md`, preserve native scope-isolation tests, and update provenance when refreshing upstream.

## Severity and output

- **P0:** immediately exploitable compromise, unrecoverable broad data loss, or repository-wide release emergency.
- **P1:** merge-blocking correctness, security, tenant isolation, data integrity, availability, or recovery defect.
- **P2:** material reachable bug, unsafe edge case, or missing regression coverage for risky changed behavior.
- **P3:** localized actionable issue with limited impact. Omit preferences and non-actionable nits.

Every finding needs a tight location, a reachable failure path, a binding expectation, and correction direction. Lower confidence or report a question when intent or reachability is unproven. Summarize reviewed areas as `finding`, `reviewed-clean`, or `not-covered`; never present partial coverage as complete.
