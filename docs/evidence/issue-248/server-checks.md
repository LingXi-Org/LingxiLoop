# Issue 248 server checks

The implementation adds personal, reversible conversation-list removal. It does not delete conversations, messages, channel bindings, or membership. Delete and restore use the existing `conversation:write` route authorization and recheck conversation membership inside the write transaction. Removed-list reads use the existing project authorization and channel membership projection. A revoked member continues to receive the existing 404 response.

API:

- `DELETE /api/conversations/:id` → `{ "ok": true, "removed": true }`
- `POST /api/conversations/:id/restore` → `{ "ok": true, "removed": false }`
- `GET /api/im/channels?removed=true` → existing conversation-array shape, limited to the current user's removed and still-authorized channels.
- Default `GET /api/im/channels` excludes those personal removal records.

Migration `0049_conversation_list_removals` is additive and transactional. Its composite foreign key preserves conversation/company/project scope. Restore deletes only the personal preference row. Shared message history and membership remain unchanged.

Checks run with the exact locked LingxiOS 3.5.8 dependency:

- `npm run server:typecheck` — pass.
- Biome lint for changed server implementation and `channels-startup.test.ts` — pass.
- `node --import tsx --test server/src/__tests__/channels-startup.test.ts` — 1/1 pass. The regression failed before parallelizing the independent channel DB and IM summary reads, then passed. IM summaries alone cannot add unauthorized channels.
- `npm run test:integration -- --file conversations.test.ts --file migration.test.ts` — initial 43/47 pass. Four failures were outdated test expectations: existing nonmember denial is 404, and adding migration 49 changes the expected count/list. No authorization behavior was weakened.
- After correcting those expectations, the four affected cases plus the new migration case were rerun: 5/5 pass (`server-integration-targeted.tap`). The 0049 migration verifies rollback, unchanged conversation data, scope foreign keys, and repeat-run idempotence. The delete/restore case verifies repeat DELETE, default/removed list projection, other-user visibility, retained membership, restore, and revoked-member denial.

The targeted rerun used Node's `--test-name-pattern='personal conversation deletion|0044 failure during fresh cutover|a failed fresh cutover|an empty database reaches|0049 adds'` against the same two files, with `--test-concurrency=1` and `--test-force-exit`.

All integration operations used newly created local containers on loopback ports 5549 (PostgreSQL) and 6399 (Redis), with a dedicated `lingxi_issue248_test` database, embeddings disabled, and an unreachable local model endpoint. No production system or real-user conversation was accessed or modified. The temporary containers were removed after verification. No browser, device, or model acceptance suite was run.
