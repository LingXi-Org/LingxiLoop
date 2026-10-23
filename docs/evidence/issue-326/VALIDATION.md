# #326 synthetic validation

Base: `bd4b5cbc` (latest main read at task start). Runtime: formally locked
`@lyyzka/lingxios` 3.8.2, native schema 14; no dependency or schema changes.

## Confirmed code paths

1. New default DeepSeek lost the former GLM-only auxiliary streaming setting.
   Before the fix, the same local provider with 250 ms auxiliary generation and
   20 ms progress failed both DeepSeek cases (run status `partial`, expected
   `succeeded`), while both GLM cases passed. With the setting restored for the
   new default, all four pass. The fixture scales first-byte/idle to 100 ms;
   production budgets remain 30 s / 30 s, request 90 s, total 120 s, max 3 tries.
   This proves a configuration recovery defect, not actual provider health or
   the original incident's exact failure stage.
2. Run errors and durable system feedback used separate timeline identities.
   Exact conversation/sender/thread/run/version/status matching now folds the
   terminal explanation into the existing error/cancellation display. Native
   terminal feedback metadata and canonical history remain unchanged. Unknown,
   conflicting or unmatched receipts remain visible. No text deduplication.

## Checks

- `node e2e/server/run.mjs --file runtime-chat-recovery.test.ts --file runtime-auxiliary-latency.test.ts --file runtime-reliability.test.ts --file runtime-provider-timeout.test.ts --file runtime-deadline-recovery.test.ts`: **12/12 pass**. Disposable local PostgreSQL/Redis, synthetic HTTP, recording WuKong; no real provider calls.
- Server smoke suite: **125/125 pass**. Focused model pricing/public-text configuration: **5/5 pass**.
- `npm run server:typecheck`, `npm run typecheck`, `npm run test:e2e:typecheck`, `npm run server:lint`, `npm run lint`: **pass** (web lint reports three pre-existing informational findings).
- UI projection/components/branch tests: **30/30 pass** after first reproducing duplicate-terminal failures.
- Official `@e2e-dev/web` test `e2e/web/terminal-projection.e2e.ts`: **1/1 pass**. Covers replay, a second identical user question with an independent answer, reload, and missing-run fallback. Local report: `.e2e/issue-326-ui-final/report.json`; screenshots contain synthetic data only.

The integration suite checks transient 503 recovery, persistent 503 at three
attempts, quota 402 at one attempt, allowlisted failure categories and request IDs,
per-attempt settlements, identical-text distinct runs, ingress and terminal replay
idempotency, cancellation, timeout and revoked project access. The auxiliary
fixture confirms one completed tool receipt/event pair survives model retries;
it uses a read-only tool and does not claim a new production mutation test.

## Pending acceptance

Original incident root cause, actual deployed model/configuration and live Q&A
remain unverified because original IDs were not supplied and this task does not
own deployment. The upstream public terminal reason still groups model failures
as `model_unavailable`; precise quota/timeout/provider categories are verified in
the sanitized model ledger. Do not infer provider outage from that public label.
Control-plane and client failure diagnosis requires scoped stage evidence.
See [production probe handoff](PRODUCTION-PROBES.md). No production accesses,
merges, deployments, persistent privilege changes or user screenshots are part
of this branch.
