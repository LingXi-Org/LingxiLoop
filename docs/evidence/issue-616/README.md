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

Deterministic guidance tests verify policy admission, not that every model obeys the policy. Scripted output and source-card rendering do not prove a live model will omit arbitrary secrets or faithfully summarize unknown JSON. The follow-up below adds real provider output qualification for six synthetic cases. The original production conversation, browser interaction, complete Worker/native-v3 streaming path and live tenancy/ledger/delivery were not replayed. Prompt instructions are not a secrecy boundary.

Only the issue-616 branch is owned here. At the check, open PRs 614 and 615 did not touch these changed files. The parent integrator owns independent frozen-candidate review and release coordination, including any later #611/#612 overlap. This work creates a draft PR only: no approval, merge, deployment, SDK publication, credential change or issue closure.

## Real provider output follow-up (2026-11-02)

The follow-up reused the existing ignored `.env.local` provider configuration through the shared `createOpenAIClient`; no credential was created, changed, printed or copied. Provider: `api.siliconflow.cn`, model: `deepseek-ai/DeepSeek-V4.1-Flash`. Only synthetic observations were sent. The test performs no product database writes, overrides no product ledger or authorization, disables provider thinking, uses zero SDK retries, and calls no reviewer model. Its local evidence retains provider token usage and visible output; this is an isolated output evaluation, not a product billable run or native Worker qualification.

Reproduce the opt-in fixture (ordinary CI skips the live request):

```sh
LINGXILOOP_LIVE_PUBLIC_ANSWERS=1 NODE_USE_ENV_PROXY=1 DOTENV_CONFIG_PATH=.env.local ISSUE616_EVIDENCE_PATH=/tmp/616-live \
  node --import dotenv/config --import tsx --test --test-force-exit server/src/__tests__/public-answer-live.test.ts
```

The fixture uses the exact current product answer/citation instruction constants, the registered progress-skill body, and the same `publicActivitySchema` → Zod JSON Schema conversion used by native tools. Tool observations are synthetic fixtures; no actual knowledge read is claimed. Progress uses a real provider tool call parsed against the native schema, with `kind=commentary` explicitly requested. Visible labels/text/plan steps are examined; internal tool-wire item IDs remain separate from public copy.

Final run: **6/6 cases passed** (7 Node tests including the parent), 22.0 seconds total. [Actual visible outputs, usage and manual review](real-provider.json) cover ordinary JSON-backed answers, title/known-author/page attribution, unknown author, failed read, partial read, the explicit technical ID/version/error-code exception, and valid public commentary. All cases exclude synthetic token/private-note/ownership fields; ordinary answers and progress additionally exclude source IDs, hashes, ready and raw error codes. Partial-read source content stays at the excerpt's level; added general background is separately labelled. The final wording honestly states the missing second source and does not claim a completed comparison.

All earlier attempts are retained, rather than reporting only the green sample:

- [01](attempts/01-original.json): disclosure checks passed, but manual review found an unsupported scaled-dot-product subtype and weighted-average claim attributed to the excerpt. Citation guidance now prohibits expanding source claims beyond returned detail.
- [02](attempts/02-grounding.json): a normalization step was still added before the citation. The technical test also incorrectly rejected a legitimate page citation; that overrestriction was removed.
- [03](attempts/03-technical-exception.json): source grounding improved; the test incorrectly rejected a relevant error code during explicit troubleshooting. The technical case now explicitly asks for that code, while ordinary/progress cases continue to forbid it.
- [04](attempts/04-diagnostic-and-plan.json): the technical answer echoed raw availability fields beyond the named diagnostic fields; guidance now limits named-field requests to those fields plus a plain-language explanation. A spontaneously chosen plan also failed native `state`/`activeIndex` validation. Its public text was not captured before parsing failed; subsequent fixture code preserves visible text on schema failure. Final progress qualification explicitly exercises commentary, and does not qualify arbitrary plan generation or correction.

There were 30 direct provider calls across the five runs, with no reviewer calls; 29 public outputs are retained because of the noted initial schema-capture gap. This small directed sample does not establish a statistical non-disclosure guarantee. The existing publication, tool admission and audience authorization remain the enforcement boundaries.

The first attempt to launch the whole smoke runner with the live flag used that runner's placeholder key and was refused by the new guard before a provider request. That smoke retry was stopped while an unrelated artifact test was waiting, and is not counted as passed. The isolated command above preloads the existing authorized configuration and is the recorded live result. Focused guidance/citation tests and lint were rerun after the changes; local server typecheck remains limited by the preinstalled 3.8.16 SDK. Final PR CI, rather than that old local installation, owns locked-3.8.21 qualification.
