# Independent #154 / #160 joint review

Cloud checkout: product main merge `8513e8f84707f976d5f58a9ca63683a97ffcc8cf` plus PR167 `24a086f7d4a40d62f7bebfd8188d20bffa798057` and PR165 `3c9e0f2d9cf386b9840d75f56183d5a172fd6ae9`. Dependency remains the exact published `@lyyzka/lingxios@3.4.7` from the frozen product lockfile. No local runtime substitution.

Independent reruns on 2026-10-17:

- `node scripts/test-im-send-reconciliation.mjs --regression`: 23 passed, zero failures/skips.
- `node scripts/test-im-send-reconciliation.mjs --real-wukong`: 17 passed, zero failures/skips. Pinned local WuKongIM transport accepted one send and retained one message through worker recovery. The runtime result/message key stayed stable with no additional model call or action budget.
- Official `tester-army/e2e` / `@e2e-dev/web`: `E2E_CONNECTION_RECOVERY=1 E2E_RECOVERY_EVIDENCE_DIR=.e2e/joint-154-160/counts E2E_BASE_URL=http://127.0.0.1:5196 npm run test:e2e:web -- e2e/web/connection-recovery.e2e.ts --output .e2e/joint-154-160 --video on`. Run `01a147fa-6b10-7a2e-924e-3d5181bec7a8`: 15/15 passed, zero skips, 191 seconds. API fixture on 5199, local WuKongIM and published runtime.

The browser checks boot recovery, lost response and invalid receipt reconciliation, terminal 401/403/404, A→B→A identity changes, rapid logout/sign-in, pre-acceptance network failure, and cut/silent/offline SSE. Counts use actual message rows in addition to unique nonces. Lost response retains one original message and permits a separate second send. SSE recovery retains one work item and reaches persisted `failed`; no automatic replay creates another work item. Cross-identity dispatch count is zero.

Raw independent evidence is under `/workspace/LingxiLoop-client-im-review/.e2e/joint-154-160/` (report, JUnit, screenshots, video and counts). Logs: `/tmp/pr154-160-joint-integration.log`, `/tmp/pr154-160-real-wukong.log`, `/tmp/joint-recovery-browser.log`.

Review blockers on the reviewed PR167 head: its CI `native-admission` fixture omits an accepted assistant message from history and expects another send after lost acknowledgement; this conflicts with the safe unknown-outcome contract. Maintenance receipt repair also catches arbitrary authorization callback errors as forbidden. Both must be corrected and CI rerun before merge.

These are product recovery fixture tests using scripted authentication/model behavior, not full SPA, live model provider, real session expiration, project-only revocation, multi-tab, production rollout or a 24-hour soak. No such acceptance is claimed.


## Final review and merge qualification

The two original PR167 blockers were resolved at `72daa61e13371430620541704752bcef9fff1b35`:
lost acknowledgement now reconciles the accepted assistant history with one dispatch, and infrastructure/implementation authorization errors remain classified failures rather than permission denials. Only an actual `ForbiddenError` is permanent forbidden.

Independent cloud reruns include that exact head, PR165 `3c9e0f2d9cf386b9840d75f56183d5a172fd6ae9`, and shared authorization PR169 `e94f9d92776d5b74d4ab5417c802eeb81c93cf36` with the published 3.4.7 lock:

- `node scripts/test-im-send-reconciliation.mjs --regression`: 27 passed, zero failures/skips.
- `node scripts/test-im-send-reconciliation.mjs --real-wukong`: 20 passed, zero failures/skips; actual pinned local WuKongIM accepted one send and retained one message across recovery.
- `node e2e/server/run.mjs --file native-authorization-faults.test.ts`: 3 passed.
- The official browser run above remains the evidence for PR165; it predates PR167's final two server fixture/error-classification corrections and is not relabelled as a later full SPA run.

Final PR167 CI run `39002376682`, PR165 `38999100183`, and PR169 `39000766274` passed their required scoped checks. Ordinary merges: PR169 `1e87c8e3`, PR167 `ec0b4df7`, PR165 `d7ce5e42`. No branch protection override or production command was used. Logs: `/tmp/pr154-159-160-latest-regression.log`, `/tmp/pr154-159-160-latest-real-wukong.log`, `/tmp/pr154-159-latest-authorization.log`.

Directory/foundation joint review combined PR166 `a0c7ec9c`, PR168 `b07aec69`, and PR169: directory audience, native authorization, readiness, metrics and lifecycle integration passed 21/21. PR166 and PR168 scoped CI also passed; ordinary merges are `688e07b6` and `67b1e8b5`. This qualifies their scoped changes, not the remaining production performance/soak/Komodo acceptance in #153.
