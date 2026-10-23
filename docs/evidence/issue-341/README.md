# #341 answer revision projection

Superseded answer candidates retain their public text under an explicit, collapsed transcript disclosure. They no longer supply normal progress prose or its compact summary. Real commentary and failed tools remain in their existing locations, and current streamed/accepted text remains in the answer through the commit-read gap. The transcript never activates archived visualization references.

The existing v1 annotation schema is unchanged. Projection-owned `revision:public-text:<hash>` identities distinguish superseded answer transcripts; accepted source history keeps its existing `archive:public-text:<hash>` identity. Lifecycle labels are fixed product copy. No text comparison, fuzzy deduplication, failure suppression, provider call changes, or production access is involved. Old base `29be24f5` native wire readers successfully parsed all six generated frames/pages.

Failure inventory was written before implementation in [projection-failure-model.md](projection-failure-model.md).

## Validation

- Web tests: 123/123 passed; server tests with the new test included: 127/127 passed.
- Web/server lint and typecheck, E2E typecheck, production build: passed. Existing unrelated lint/build warnings remain.
- Focused projection tests: 10/10 passed, including first answer, explicit supersede, pending acceptance, commit, replay, failure/cancellation retention, and answer-only copy text.
- Official tester-army `e2e` 0.17.0 / `@e2e-dev/web` 0.12.0: 4/4 passed. The fixture sends real server projection snapshots through the normal AssistantTransport decoder, store, and conversation renderer; it is synthetic fixture coverage, not a provider or production run.
- Browser assertions cover collapsed/full transcript keyboard access, visible genuine commentary and failed calls, committed partial output, history loading, reconnect, unchanged answer DOM/selection across acceptance, and same wording in distinct messages.

[Runner report](browser/report.json), [source/artifact hashes](browser/sha256.json), [collapsed draft and real failure](browser/001-answer-revision-collapsed-with-real-failure.png), [commit/reconnect](browser/002-answer-revision-committed-reconnect.png), [same text in separate messages](browser/001-answer-revision-same-text-distinct-messages.png).

The local runner report records the precommit dirty worktree against the stated base; `sha256.json` binds the verified source tree. Exact-head CI and independent review remain release integration gates.

## Reproduce

Run from the product checkout with its pinned npm dependencies installed. All environment values below are dummy isolated test values; no backing product services are used.

```sh
ISSUE304_SNAPSHOTS=.e2e/issue304-snapshots.json \
ISSUE341_SNAPSHOTS=.e2e/issue341-snapshots.json \
DATABASE_URL=postgres://unit-tests@127.0.0.1:5432/lingxiloop \
REDIS_URL=redis://127.0.0.1:6379 \
WUKONG_USER_TOKEN_SECRET=unit-test-wukong-user-token-secret \
OPENAI_API_KEY=unit-test-key \
LINGXILOOP_INVITE_BASE_URL=https://app.test.invalid \
node --import tsx --test --test-force-exit \
  server/src/__tests__/answer-revision-projection.test.ts \
  server/src/__tests__/answer-first-projection.test.ts

ISSUE304_SNAPSHOTS=.e2e/issue304-snapshots.json \
E2E_TELEMETRY_DISABLED=1 \
node node_modules/e2e/dist/cli/bin.js run \
  --config e2e.answer-first.config.ts \
  e2e/answer-first/revisions.e2e.ts e2e/answer-first/v2-stream.e2e.ts \
  --output .e2e/issue341-browser-verified
```

If the default browser cache is not writable, set `PLAYWRIGHT_BROWSERS_PATH` to a writable cache directory when running the official engine. No Playwright API or direct runner is used.
