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
