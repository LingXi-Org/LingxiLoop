# CLI and public memory text production releases — 2026-10-20

## Actual production checkpoint

`d00e5f7b93cd04405e2e2ee62f0879e8bd3e4b5f` was accepted at 17:34:09 UTC. All four A/B Web/Worker containers use audited image index `sha256:9214d5d81d538bbacf4ecfb95555d9c36b40561efacb48d2b33d34aa43977f53`, are healthy, and have zero restarts. The 34 native Komodo updates were independently re-read as `Complete`, `success: true`; final state update `6ad7a5e3e06d5e1f79837843`. All 13 final acceptance checks passed. Both stacks were idle; the four HTTPS health/version routes returned 200. Runtime3.5.8, native schema13, product schema48 and protocol11 remain exact. The execution-environment disconnection notification was investigated: the original release process completed, and no duplicate rollout was submitted.

The earlier CLI batch `10db48ad8254f3d74918ae5aabed46c239505f6f` was accepted at 17:10:16 UTC with 34 successful native updates and the same 13 checks. It delivered PR242 resource lifecycle cleanup and the already-scoped old-batch test/config changes. It has now been superseded by d00.

## Delivered behavior and limits

- PR243 repairs the bounded visualization authoring/reference contract. The original provider numerical and incomplete-delivery failures remain tracked under #247.
- PR249/#245 removes the activity aggregation components and uses native ordered text/tool/text. User-requested memory tools allow actual public narration before tools and between results. Existing runtime text persistence/SSE ordering was verified by the worker's deterministic HTTP integration evidence; no new streaming protocol was introduced.
- No live production-provider first-content percentile or end-user login/browser claim is made. The release checks establish exact deployment and service readiness, not provider responsiveness or all visualization quality cases. Prior six supplemental browser cases remain unrun as recorded in the old-batch ledger.
- The paused runtime3.5.3 durability observation was not touched. No credential, grant or security-policy change, production fault injection, database reset, or private runtime hook was used.

## Mirror failure and reversible recovery

The registered `accel.way2api.fun` route returned522 during CLI A preparation, native update `6ad79a9ce06d5e1f798375ab`; the source Compose was restored successfully by `6ad79deee06d5e1f79837655`, then the controlled retry succeeded. Memory batch B preparation later returned522 at `6ad7a0f4e06d5e1f79837720`; restoration `6ad7a2abe06d5e1f79837779` succeeded and rechecked the original four container identities before retry. Both failures happened before service stop/deploy. The original failed receipts and restoration evidence remain preserved in the operator evidence directories; retries use separate directories. No alternate proxy, TLS bypass, credential change or automatic retry loop was used.

## Evidence

The two subdirectories retain the original sanitized plan, preparation/execution events, native terminal projections, read-only production inventory, audited immutable image receipt and final acceptance JSON. `SHA256SUMS.json` binds these original bytes. Native receipt projections deliberately contain no raw process logs, environment values, memory text, prompts or credentials. The final acceptance input hashes refer to these original files; earlier accepted-source evidence remains linked by hash. Container/native identifiers can be checked through the existing authorized Komodo read API.

Feature evidence: [#245](../issue-245/README.md), [old-batch scope](../batch-close-20261020/README.md). Upcoming cf4 conversation/visualization product49 and later #247 work were not deployed at this checkpoint.
