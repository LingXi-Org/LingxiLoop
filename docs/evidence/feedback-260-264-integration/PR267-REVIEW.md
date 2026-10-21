# PR267 independent review

Reviewed exact `d88c4b5d0e42ba6d4bd48785c526c18e888dfa48` against its parent, the complete public PR/issue260 bodies and comments (none), inline reviews (none), and exact-head CI. **Code GO: no P1/P2 implementation finding.** Merge bookkeeping must remove `Fixes #260`; use “Partially addresses #260” and keep the issue open. The original private failure path remains unverified.

## Call-path findings

- `message-projection.ts:74,96` applies the existing Markdown-aware preview projection to public model text and explicit progress only. It retains adjacent prose, code examples, stable activity IDs/status/order. The helper returns zero or one text part, so the unchanged ID map cannot discard multiple text fragments.
- Actual callers are `RunStreamProjection.snapshot` (foreground, `includeAcceptedPublicText:false`) and `activityPage` (authorized history). `delivery.ts:102` uses the committed projection's message as its persisted payload. `NativeMessageContent` sends text parts through `VisualizeText`, which previously interpreted old commentary directives after whole-message completion. The source-level failure scenario is therefore reachable.
- Delivered-answer processing at `message-projection.ts:164` is unchanged: only delivery=delivered retains active reference syntax. No new aggregation UI, candidate body source, whole-candidate replay, fallback conversation or file-path rewrite is added. Existing accepted-part foreground exclusion remains in place. Nonaccepted public prose remains under the existing policy; this PR does not redefine that policy.
- `visualize.ts:23-45` is unchanged: company+conversation output-root binding, current membership/teacher access and exact SQL scope remain mandatory. Candidate verification still authorizes and reads only the current scope's literal reference. New API assertions preserve same-conversation200 and other authorized conversation403.

## Evidence and limits

- Independently ran only the new exact-head pure projection test file with existing formal3.6.0 dependencies: **2/2 PASS**, `independent-boundary.log`. Initial extraction lacked the unchanged tweakProtocol module; preserved `incomplete-extraction.log`, extracted that public dependency, then reran successfully. No product code was edited.
- Author's repository report records12 projection tests,6 local PostgreSQL/API tests, typecheck and lint; those broader local runs were not independently repeated.
- Exact CI: https://github.com/LingXi-Org/LingxiLoop/actions/runs/39535124479; status `in_progress`, conclusion `pending`. Jobs: [{"name": "changes", "status": "completed", "conclusion": "success"}, {"name": "checks (deploy-contract)", "status": "completed", "conclusion": "success"}, {"name": "integration", "status": "in_progress", "conclusion": ""}, {"name": "checks (server)", "status": "completed", "conclusion": "success"}]. A pending integration check is not a pass.
- This is a narrow publication-boundary repair, not evidence that the original screenshot403 has one proven cause. Previously persisted payloads are not migrated or rewritten. Keep260 open for the remaining original-case diagnosis/acceptance under proper authority.
- No production/API/SQL/provider/browser/private conversation/HTML/screenshot access. GitHub public metadata was read only. Forbidden production diagnostics were not accessed. Current266 release is unrelated and need not wait.
