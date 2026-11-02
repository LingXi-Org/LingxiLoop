# Issue 616: user-facing answers and source attribution

## Scope and observed causes

Base: `3cbc78d8` (`main`, LingxiOS dependency pinned to 3.8.21). No original failing conversation was supplied; this change does not claim a reproduced production root cause.

Source inspection established two concrete conflicts: product context, the course skill and the citation validator prohibited source-title links; `ResearchSources` unconditionally displayed the internal `sourceVersion`. The first is now coordinated across generation and validation; the second is removed from visible copy while retained in source identities and replay/deduplication.

A shared trusted generation rule covers ordinary answers and public progress text, plan titles/steps, parentheses, tables and links. It requires extracting useful findings rather than reciting records, truthful partial failures, source-confirmed authorship (creator/owner is not author), and minimal authorized technical details only on explicit request. It explicitly excludes credentials/tokens/unrelated private data even for technical requests and quoted/code data. The existing authoring and publication paths remain in place; no review model, extra model call, general redactor or field blacklist was added.

The product context always supplies the rule; the selected progress skill retains it through the existing exact-version/hash selection mechanism. The course skill retains excerpt-specific marker scope, actual retrieval outcomes and the bounded retry rule. The citation validator permits descriptive source titles and supported answer wording while continuing to reject numeric/generic labels and recorded raw IDs/URLs. The existing runtime still owns evidence membership, frozen excerpts and output contracts. Knowledge reads, tenant/audience authorization, private data handling and source identity storage are unchanged.

## Reproducible checks

Environment: cloud Linux, Node 24.19.0. The preinstalled SDK is 3.8.16, although the repository locks 3.8.21. Normal package installation of 3.8.21 through the configured GitHub Packages registry returned HTTP 401. No credentials, alternate SDK source or dependency code was used to work around it; lockfiles are unchanged.

- Regression first: the changed `ResearchSources.test.tsx` assertion failed on the old visible `版本 v1/v2` output, then passed after the production change.
- `CI_TEST_FILES='["server/src/__tests__/public-answer-guidance.test.ts"]' npm run server:test`: **161 passed**. Includes title citations, ID labels in tables/parentheses, immutable evidence, actual selected progress guidance and course-rule consistency. Uses the preinstalled SDK; it does not qualify formal 3.8.21.
- `npm run test`: **138 passed** before the final added source-card case. `node --import tsx --test --test-force-exit src/features/chat/components/ResearchSources.test.tsx`: **7 passed** after that addition. Includes one/multiple source cards, page links, retained version identities, synthetic internal IDs/hash/unknown author/token/path omission, credential-bearing URL rejection, and visible failure/cancellation with hidden diagnostics.
- `npm run server:lint`: passed. `npm run lint`: passed with existing warnings.
- `npm run server:typecheck`: blocked by the old installed SDK's lack of `native-v3` in existing runtime/integration files. No diagnostics referenced changed files.
- `npm run build`: passed, including web TypeScript checks and production Vite build (existing chunk-size/dependency annotation warnings).

The extended `confidence-citations.test.ts` integration fixture asserts the **actual product context reaches model requests** without the old contradictory rule, and sends a title citation through the frozen excerpt, ledger, IM delivery and authenticated reconnect path. Its existing auxiliary-call/compaction methods throw, so the fixture cannot silently add a reviewer model. Run with `npm run test:integration -- --file confidence-citations.test.ts` against a dedicated test Postgres and Redis. Local execution is unverified because those services and the locked SDK are not configured in this environment; PR CI owns this gate.

## Limits and handoff

Deterministic guidance tests verify policy admission, not that every model obeys the policy. Scripted output and source-card rendering do not prove a live model will omit arbitrary secrets or faithfully summarize unknown JSON. No live-provider run, original production conversation replay, or browser interaction test was performed. A live provider qualification for mixed source content/metadata, ready/unavailable/partial failure, unknown author, and explicit technical requests remains a release acceptance gap. Prompt instructions are not a secrecy boundary.

Only the issue-616 branch is owned here. At the check, open PRs 614 and 615 did not touch these changed files. The parent integrator owns independent frozen-candidate review and release coordination, including any later #611/#612 overlap. This work creates a draft PR only: no approval, merge, deployment, SDK publication, credential change or issue closure.
