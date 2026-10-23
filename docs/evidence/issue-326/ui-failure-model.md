# Issue 326: terminal presentation failure model

Written before the UI regression and implementation. This uses synthetic messages;
the original incident has no message/run IDs and its model failure cause is unknown.

- A failed run is projected as an assistant error while a separately delivered
  system terminal feedback message repeats the same outcome.
- IM delivery before/after SSE, history reload and repeated snapshots can retain
  both rows. Deduplicating text would also destroy distinct user messages.
- A missing run snapshot must leave the durable terminal feedback readable.
- A feedback from another conversation, sender, thread, run, request version, or
  lifecycle must not hide or alter the current run; an old failure cannot stop a
  newer request. Unverified/malformed system messages stay visible.
- When the snapshot has authoritative terminal feedback, its ID/version/status
  must match too and its metadata must remain untouched. Conflicting feedback
  identities without authoritative confirmation remain separate evidence.
- The surviving error must retain its public terminal detail and retry target;
  cancellation must remain cancelled. Published prose/tools remain unchanged.
- Presentation must not mutate the canonical history or invoke any operation.
  Explicit regeneration branch selection must not leave orphan terminal notices.

Verification: synthetic identity/replay regressions at the existing presentation
boundary, plus rendered ConversationMessage assertions for error detail/retry and
cancellation. The owning transport's existing recovery tests retain scope fencing
and bounded read-only observation coverage.

## Verification result

- Before implementation, 4 of 5 presentation regressions failed: one run produced
  two rows, each distinct failed run kept its extra notice, cancellation repeated,
  and selecting a regenerated reply left orphan notices.
- After implementation and authoritative-feedback hardening, all 30 focused
  projection, regeneration, and rendered-message checks passed. Web typecheck,
  E2E typecheck, and lint of the seven affected source/test files passed.
- Official `@e2e-dev/web` browser check passed (1/1), including history replay,
  identical-text independent user messages, a successful second answer, browser
  reload, and the durable fallback when a run snapshot is unavailable.

Repeat the focused checks:

```sh
node --import tsx --experimental-test-module-mocks --test --test-force-exit --test-concurrency=1 src/features/chat/runtime/terminal-projection.test.ts src/features/chat/runtime/reply-branches.test.ts src/features/chat/components/ConversationMessage.test.tsx
npm run typecheck
npm run test:e2e:typecheck
```

Start a local Vite on port 5196 and an isolated Chromium CDP on port 9228, then:

```sh
E2E_BASE_URL=http://127.0.0.1:5196 E2E_CDP_URL=http://127.0.0.1:9228 npm run test:e2e:web -- e2e/web/terminal-projection.e2e.ts --output .e2e/issue-326-ui-final
```

Local evidence is `.e2e/issue-326-ui-final/{report.json,junit.xml,summary.md}` and
two synthetic screenshots under its `artifacts` directory. These browser results
exercise the product presentation components, not actual provider recovery or the
original incident. No production data, credentials, or private screenshots were used.
