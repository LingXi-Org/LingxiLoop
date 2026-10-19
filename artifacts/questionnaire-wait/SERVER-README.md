# Issue 183: durable questionnaire wait

This is a product fix validated with an **unpublished LingxiOS 3.5.3 candidate**. The repository dependency remains the exact published 3.5.2. Do not merge or deploy this product change until the upstream fix is published, both manifests/locks are updated to the exact release, and these checks pass with the published artifact.

Upstream: [LingxiOS PR 29](https://github.com/LingXi-Org/LingxiOS/pull/29), commit `aad661f0655e67c8898ebcbfd5f5cfbc1dc77ff3`. Candidate tarball SHA256: `f65245f385da2750d74b8f71fe43f46ce057aa407607e36d050689a41502dc20`. The candidate was extracted to a separate temporary directory and linked into this worktree's dependency overlay. The original workspace's dependencies were not modified. The candidate does not include the separate OOM patch being integrated upstream.

## Failure established before implementation

`baseline-server.json` preserves the initial deterministic result on product base `47ba60dc`: six questionnaire messages, seven model turns and a succeeded run with no user submission. A probe returning the public native `defer/user` directive stopped model execution but 3.5.2 rejected the durable wait with `input wait requires its current durable question receipt`. Its ledger and recovery checks recognize only built-in `task.ask`.

## Product behavior

- PostgreSQL owns one immutable questionnaire per tenant/run/request version. Model call IDs and repeated tool executions cannot create another effective node.
- `chat.ask` sends the frozen message and returns the native waiting directive; reconciliation restores the same node and directive.
- Dedicated authenticated endpoints validate the stored schema, original learner and current conversation/project permissions. The server freezes answers and the exact submission payload before sending IM. Different answers cannot reuse the node.
- A durable, bounded retry queue covers crashes before IM dispatch and after its accepted receipt. Workers use a claim token, a 60-second lease, a 30-second cancellation deadline and at most 12 automatic attempts. Unknown IM send outcomes reconcile by nonce rather than sending again. Explicit retries use the frozen answer.
- Only admitted, committed IM submissions can resume the matching run/version. Original thread identity is retained; `@` text in answers cannot dispatch another agent. Refreshes read durable waiting/pending/submitted state. A trusted run projection hides generic continuation controls for a bound questionnaire.
- Historical recommendation replies remain valid only when their original authoritative IM message is a recommendation and they carry no continuation authority.

## Final verification

`server-validation.json` and `server-integration.log` record **30/30 integration tests**, zero skipped, across six owning files. The six new cases cover normal waiting/submission, public native defer, the built-in control, submission before the wait transition, and crashes before/after IM send. Coverage includes real HTTP submission, signed duplicate webhooks, the production ingress/receive path, duplicate resumes, changed answers, forged generic sends, tenant/project denial, revoked room membership, `@` text, original threads and concurrent recovery.

Also passed: `server:typecheck`, `server:lint` without warnings, and **106/106 server tests**. Migration 0044 was applied to disposable local PostgreSQL and a second migration run was a no-op. No production data, live model endpoint or production IM service was used.

Reproduce after installing the exact released runtime (or an explicitly labelled isolated candidate):

```sh
npm run server:typecheck
npm run server:lint
npm run server:test
node e2e/server/run.mjs --file questionnaire-wait.test.ts --file im-conversation-style.test.ts --file native-message-flow.test.ts --file native-message-approvals.test.ts --file im-send-reconciliation.test.ts --file interactive-ui-disabled.test.ts
```

The integration runner now explicitly selects TAP. Previously this Node version emitted the spec reporter, causing the artifact parser to report zero tests despite passing test subprocesses. An adjacent regression also caught a new eager questionnaire import keeping Redis handles open in the maintenance CLI; questionnaire admission is now loaded only for questionnaire messages and the unchanged CLI timeout passes.

The frontend agent's browser evidence is in this same directory. Remaining release blocker: publish the upstream runtime and qualify the product against that exact published package; candidate-only green results do not satisfy this release gate.


## Follow-up: bounded recovery after an accepted answer

Review of product head `e6a2fe53` reproduced an accepted answer whose final ingress attempt lost its lease. The wake reached 12 attempts and became failed, but replaying the same answer returned an accepted duplicate without repairing the wake. The original run remained waiting at request version 1. The preserved red evidence is in `resume-repair/before.json`.

The follow-up distinguishes accepted IM (`resuming`) from a consumed continuation (`submitted`). Pending recovery displays the frozen answers and polls without sending. An authenticated manual retry can replenish only an expired failed, unconsumed canonical wake for the same payload, original principal and current waiting request version. Current room authorization is checked again. Healthy claims, completed wakes, cancelled runs and superseded request versions cannot be reset; automatic processing retains its 12-attempt bound.

After the public `continueInput` API succeeds or acknowledges the same input, the receive path records consumption on the canonical product wake. This also covers a signed IM webhook reaching the runtime first. The marker preserves attempts and historical failure fields; consumers prioritize `delivered_at` and never retry it. Reads use the existing wake primary key; no runtime tables or schemas are modified by the product fix.

Additional integration cases cover an expired twelfth resume attempt, concurrent explicit retries, active claim preservation, cancellation, version changes, removed room membership, a signed webhook consuming the answer first, and process loss after IM acceptance on the twelfth submission attempt. The browser regression checks frozen answers, refresh without POST, the explicit retry button and one successful retry. See `resume-repair/validation.json` and its screenshot/report for exact counts and the candidate-runtime limitation. The official published dependency pin and final release requalification remain required.
