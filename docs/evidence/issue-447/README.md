# Authoritative quote context (#447)

Base: `9e3bfd892fa53f22dddbc00e98f466c21ce01b7d`. Draft PR: <https://github.com/LingXi-Org/LingxiLoop/pull/456>.

The receiver read quoted attachments but passed only the new message text into the formal runtime. The runtime does not reconstruct arbitrary committed IM quotes from a thread ID. Consequently an old quote was absent from actual model input, while retry/regeneration could submit only a control message. The composer also preferred the thread root over an explicitly selected quote. These failures were reproduced with synthetic data before the fixes.

`request-references.ts` now follows at most eight necessary committed-message relationships using the existing tenant/channel-authorized reader. It includes the original task, quoted bodies, stable IDs, recorded authors, and attachment associations in `conversations.ingest.text` / `continueInput.text`. Ordinary quoted assistant answers do not trigger unrelated task-history reads. Missing records, cycles, traversal limits and truncation are explicit; bodies never come from browser previews. The encoded request observes the published 100,000-character ingress limit, and existing model/context budgets still apply. Only the current human text determines addressed agents.

The UI preserves `replyToClientMsgNo` for the selected quote, separate `threadRootClientMsgNo` for thread scope, and explicit retry/regeneration targets. Existing send retries retain their original payload and message identity. The runtime version, database schemas, authorization, frozen audience, attachment access checks and rollback mechanisms are unchanged.

| Path | Recorded acceptance |
| --- | --- |
| First quote | Complete 503-character source, author and current question appear in actual model input. |
| Failed Agent retry | Actual test-model failure followed by retry restores original B and A in the current input group. |
| Regeneration | A delivered assistant's committed `sourceRef` restores B and A; frontend branch target and thread survive history replay. |
| Failed send retry | Production transport/outbox test reconstructs transport after failure, replays identical payload/message ID and retains attachments. |
| Refresh/history | Source sits behind 205 unrelated records; lookup crosses a 200-message page independently of loaded browser history. |
| Explicit quote inside thread | Quote differs from root in persisted payload, restored UI and actual model input; quoted mentions cannot add recipients. |
| Long text and bounds | Marker beyond 240 characters is preserved; unit regressions cover the encoded 100,000-character budget, cycles and eight-record limit. |
| Attachments/unavailable/plain | Model-input coverage includes quoted attachment and retry, revoked attachment with no bytes, missing/foreign-channel references, and an ordinary message. |

Final focused source checks: 27 tests across quote lifecycle/actions, converter, attachment messages, reply branches, native message schema and reference resolver; Web and server typechecks pass; changed-file Biome lint passes. The [model-input regression](model-input-regression.md) records eight passing integration tests, twelve actual test-model calls and seven failing baseline cases. No physical browser or live external LLM acceptance is claimed.

An adjacent unchanged `terminal-projection.test.ts` case fails identically on base and this branch: `store.ts` adds `sourceMessageId: undefined`, causing strict replay equality to differ. The other five tests in that file pass. This is reported without modifying another issue's implementation. It is outside the selected CI smoke list.

Handoff to the sole release integrator: the shared runtime changes are limited to `receive.ts` and `attachments.ts`; the resolver is new. `context.ts`, `runtime.ts`, Worker, delivery and dependency manifests/locks are untouched. `im/webhook-application.ts` only preserves the separate thread root for attachment ingestion. No production writes, historical backfill, independent review, merge, deployment or issue closure were performed. Exact final-head CI is recorded in the PR.
