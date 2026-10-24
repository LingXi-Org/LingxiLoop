# Issue #424: homework material validation

Scope: the homework draft's material extraction, validation state, retry and
publication boundary. No case, chat-performance or production changes. The
original teacher PPT, MIME, production version and request logs were not supplied;
this work fixes source-confirmed gaps with invented local fixtures, not a claimed
reproduction of the reported production incident.

## Behavior and limits

- Text-bearing PPTX is extracted with the exact published `officeparser@8.2.0` in
  both root/server manifests and locks. It is never decoded as a text file.
  External assets, attachment extraction and OCR are disabled. Input, expanded
  bytes, ZIP entries, XML elements and returned text are bounded.
- The supported path includes slide order, text, tables and speaker notes. An
  image-only presentation is unreadable for this validator. Legacy binary `.ppt`
  currently requires saving as `.pptx` or a PDF with selectable text. This limit
  is explicit in the named-file feedback and is not claimed as full PPT support.
- `INVALID` is reserved for a completed model rejection of the requirements.
  `MATERIAL_ERROR` identifies known unreadable input; `ERROR` represents storage,
  extraction-service or validation-service failure. File/URL feedback supplies a
  next action without leaking internal diagnostic errors.
- Retry retains the draft content, attachments and revision. It is authorized to
  the draft's teacher and reuses the durable effect queue. Publication still
  requires `READY` for the current revision. Editing hides stale feedback and a
  failed save cannot reload over unsaved input.
- Migration 0056 extends the validation-state constraint. The migration runner
  must recognize that exact product inventory while retaining formal runtime,
  native schema and historical-prefix checks.

## Validation

Only focused checks are used. No independent review or expanded regression matrix
was started, as requested by the delegating user.

- Parser: `node --import tsx --test server/src/__tests__/homework-presentation.test.ts`
  — 8/8 passed against the real published parser and synthetic binary fixtures.
- UI: `node --import tsx --experimental-test-module-mocks --test src/features/learning/homework/HomeworkValidation.test.tsx`
  — focused status, feedback and publication-gating checks.
- Lint: changed homework server/UI files and browser fixture/config only.
- TypeScript/build: root web build, server typecheck, isolated browser fixture
  typecheck.
- Integration: only issue-424 cases in `server/src/__integration__/homework.test.ts`,
  using dedicated local PostgreSQL/Redis and a scripted model with synthetic data.
- Browser: `PLAYWRIGHT_BROWSERS_PATH=/tmp/issue424-e2e-browsers E2E_TELEMETRY_DISABLED=1 npx e2e run --config e2e.homework-validation.config.ts`.
  This uses the official `@e2e-dev/web` engine and the real homework card with a
  deterministic API. It is separate from the real-PG/material-parser integration.

Measured results:

| Check | Result |
| --- | --- |
| Real parser regressions | 8/8 passed |
| Validation UI regressions | 4/4 passed |
| Runtime profile boundary regressions | 7/7 passed |
| Issue-424 HTTP/worker/PG scenarios + 55→56 migration | 5/5 passed, 18.57s |
| Fresh migration | 56 migrations applied, 1.83s |
| Second migration | Already current, 65ms |
| Server typecheck | Passed |
| Final web typecheck and production build | Passed; Vite build 52.71s |
| Changed-file lint and fixture TypeScript | Passed |
| Official browser scenarios | 3/3 passed |
| Final file-specific service feedback | Affected browser scenario 1/1 passed |
| Settled editor / light and dark screenshots | Affected browser scenario 1/1 passed |

The integration invocation was:

```sh
node --import tsx --experimental-test-module-mocks --test --test-force-exit \
  --test-concurrency=1 --test-name-pattern=424 \
  server/src/__integration__/homework.test.ts \
  server/src/__integration__/homework-validation-migration.test.ts
```

It used the freshly created local `lingxiloop_issue424_test` database on port
55424, local Redis on port 56424, synthetic service settings and a deliberately
unreachable model base URL. Only the test's explicit scripted model can respond.
The migration scenario additionally owns and removes its newly created database.
It verifies preserved existing drafts/provenance, atomic constraint-and-ledger
rollback, rejection of mismatched runtime provenance and a second no-op run.

The old `case-cover-migration.test.ts` fixture now explicitly uses the original
55-file prefix, so introducing 56 does not silently move that historical test's
boundary. No case behavior was changed; this fixture-only adaptation was linted
and typechecked but was not separately executed as an additional matrix.

Browser reports retain the original run IDs and working-tree provenance:
[initial three scenarios](homework-validation-report.json),
[final service feedback](homework-validation-service-report.json),
[settled error screenshots](homework-validation-invalid-report.json).
Screenshots were visually inspected:

- [Light-theme invalid requirements](invalid-light.png)
- [Dark-theme invalid requirements](invalid-dark.png)
- [Specific material recovery](material-error.png)
- [Service failure with the draft and file retained](service-error-keeps-draft.png)

## Environment provenance

The new cloud checkout initially had LingxiOS 3.5.2 preinstalled in both root and
server `node_modules`, while both locks require 3.8.12. Restored the exact locked
dependencies before final checks. One GitHub Packages 401 received a bounded retry
using the existing identity; no credentials were changed or exposed. The unrelated
Electron binary download was skipped for this web-only task.
The preinstalled nested server dependency tree was also restored, then moved out
of the checkout to use the same single root resolution as CI; keeping both trees
caused unrelated duplicate Zod type identities during an earlier typecheck.
The final checks use the locked root tree; both server deployment manifests and
locks include the exact new parser dependency.

The first official browser launch could not write its default home cache. The
cache was moved to `/tmp` using the official engine's supported environment option.
No browser sandbox flags, network settings or production resources were changed.

The original teacher's file and actual production model/service behavior remain
outside the synthetic evidence. Keep #424 open until the remaining legacy-format
and real-input acceptance are explicitly resolved. No merge or deployment was
performed; the parent thread owns integration and the sole production release.
