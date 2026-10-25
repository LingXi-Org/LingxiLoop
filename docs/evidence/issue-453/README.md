# Issue #453: recover failed homework drafts without editing

This is a follow-up to the already released #424/#432 implementation. The issue
supplies a transcription of two new screenshots, including the old generic
INVALID feedback. The original PPTX, draft ID/revision and production request
logs were not provided. No claim is made that this recreates that original file
or identifies which deployed worker wrote the historical result.

## Change

- All INVALID drafts expose an explicit **重新检查** action through the existing
  revision-checked validate API. The exact known historical generic feedback, and
  empty historical feedback, are presented as an unresolved check instead of an
  assertion that the teacher must change content. Historical records are not
  rewritten or automatically requeued.
- In-flight and PENDING checks cannot be submitted again by the card. A retry
  retains title, instructions, criteria, links, attachments, deadline and revision;
  the new result replaces the old feedback.
- A new model rejection must identify a current field, an exact excerpt from that
  field, a concrete reason and a suggested edit. Invalid or ungrounded responses,
  generic denials and explicitly uncertain results stay ERROR and retryable. A
  valid result retains the existing response format. Material/storage failure
  handling and current-revision READY publication guards remain in their owners.
- No parser, package/lock, database migration or API contract changes. The
  concurrent #441 OfficeParser work is outside this patch.

## Focused validation

| Check | Observed result |
| --- | --- |
| Pre-fix vague model denial regression | Failed as expected: INVALID instead of ERROR |
| New model-result unit tests | 3/3 passed |
| Validation-card unit tests | 6/6 passed; new cases first failed before implementation |
| Affected #424/#453 PG/HTTP/worker integration | 6/6 passed, 12.89s |
| New official browser recovery scenario | 1/1 passed, 20.00s |
| Server typecheck | Passed |
| Web typecheck and production build | Passed; Vite build 42.77s |
| Changed-file lint, fixture TypeScript, diff check | Passed |

The integration check uses an isolated local test database/Redis, fake storage
and a scripted model with an unreachable real model URL. Its historical draft
contains the previously saved generic INVALID result and a completed validation
effect. The same uploaded binary PPTX is actually extracted, supplied to the
validator and published only after the current revision is READY. A duplicate
retry yields one fresh model call. Existing affected cases verify specific
unreadable-file feedback, service failure, malformed results and rejection of
publication with an outdated revision.

```sh
node --import tsx --experimental-test-module-mocks --test --test-force-exit \
  --test-concurrency=1 --test-name-pattern='424|453' \
  server/src/__integration__/homework.test.ts

PLAYWRIGHT_BROWSERS_PATH=/tmp/issue424-e2e-browsers E2E_TELEMETRY_DISABLED=1 \
  npx e2e run --config e2e.homework-validation.config.ts \
  --grep 'a legacy invalid draft' --output .e2e/homework-validation-453
```

The browser uses the official `@e2e-dev/web` engine and real card/editor with a
synthetic API, separate from the real-PG integration. It verifies zero save
requests, unchanged input/attachments/revision, disabled repeat requests,
PENDING without stale feedback, a specific replacement material result and one
publication after the current revision becomes READY. No browser security flags
or network settings were changed.

- [Pre-fix failure](before-fix.txt)
- [Final integration results](integration.txt)
- [Browser report and run provenance](browser-report.json)
- [Historical draft with explicit recheck](legacy-invalid-recheck.png)
- [Specific new result replacing the old feedback](recheck-specific-result.png)

Screenshots were visually inspected. Production API/worker version consistency,
the teacher's original PPTX and actual model output remain for the designated
release environment's acceptance. This development task performs no merge or
production write, and does not automatically close the issue.
