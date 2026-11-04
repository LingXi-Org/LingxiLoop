# Learning report delivery (#674, #675, #676, #679)

Scope: teacher grading boundaries, technical report failure vs learning findings,
repeatable reports, shared-message citations and source operator fidelity. Base:
`8cc00fd8` (includes #682). Related #604 is checked against the existing strict
fence recovery; this change does not claim recovery of an unavailable historical
case or relax the styled/ambiguous paragraph guard.

## Behavior

- Explicit teacher grading criteria remain teacher-owned even when draft validation
  omitted the finding. AI cannot set their met/independent flags; teacher cards
  project actual PENDING/PASSED/RETURNED decisions. The product supports binary
  acceptance; teachers record four-level grades in the existing review opinion.
  Both authoring and review surfaces state that limitation.
- Invalid model output, failed calls and invalid citations produce INVALID with
  no fabricated all-false READY report. Required material and ACL failures remain
  blocking. A **valid** judgment with known unreadable optional content can still
  produce an explicitly unverified observation, with no mastery claims, as before.
- Re-read current authorized evidence/materials before reusing a verified report.
  Identical full input fingerprints retain the report ID/time and make no model
  request. Changed evidence, answer/task version, return epoch, model or protocol
  regenerate it. New reports include time, revisions, input hash and generator
  version; report attempt/validation metadata joins the existing LLM ledger.
- Student and assistant quotes are separately checked against exact public text
  parts. Assistant reasoning/process parts are excluded. Citations resolve only
  inside the student's shared immutable submission snapshots; teachers receive no
  additional private conversation access. Missing/changed sources have no link.
  Snapshots show message ID, sequence and (for new captures) message time.
- Compact multiplication/exponent operators in legacy learning prose are escaped
  only for rendering/import. Code nodes, ordinary emphasis and lists keep their
  parser semantics. The saved evidence used by reports remains unchanged. A native
  display disagreement falls back to the current saved text and is labelled.
  The submission exposes saved source for checking; damaged originals are never
  reconstructed from stale recovery copies.

## Recorded checks

- 14 focused source regressions pass, covering teacher boundaries, exact source
  resolution, operator fidelity, italics/code/lists and #604 conservative recovery.
- Existing HomeworkDraftCard six tests pass.
- Owning Postgres homework suite: 56/56 passed before the final ledger metadata
  addition. Final affected database rerun, final CI and independent review pending
  at this initial candidate. The local dedicated database is
  `lingxiloop_reports_test`; it was initialized by the repository's actual formal
  runtime bootstrap, with published 3.8.18→19→20→21→24 receipts and product62.
- Web/server typechecks passed before the final test-only fixture typing correction;
  final checks pending. Web/server lint exits 0 (existing unrelated web warnings).
- Actual Chromium 154 browser replay passed on 1280×1100 and 390×844. See
  `browser-result.json` and screenshots. It uses actual teacher/submission/report/
  reference components with synthetic authorized snapshots. It checks PENDING
  labeling, four operator tokens, italic/code semantics, both focus targets,
  missing-source refusal and no horizontal overflow/errors.

Reproduce source tests:

```sh
node --import tsx --test server/src/__tests__/homework-report-boundary.test.ts server/src/__tests__/homework-validation.test.ts src/features/learning/homework/report-source.test.ts src/features/learning/homework/answer-source.test.tsx src/features/learning/homework/fenced-source.test.ts
node --import tsx --experimental-test-module-mocks --test src/features/learning/homework/HomeworkDraftCard.test.tsx
npm run test:integration -- --file homework.test.ts
```

The integration command requires an initialized dedicated test database and Redis;
never point it at product data. Browser replay: start Vite on 127.0.0.1:5194 and
run `python3 docs/evidence/issue-674-679/browser.py` (Python Playwright and Chromium).

## Limits and release ownership

Original T13/T14/T20 ZIP files and #604's historical native document were not
available here. Personal Context returned unavailable for the old investigation;
current main and #682 code were examined directly. No production student data or
live-model educational-quality acceptance is claimed. Old reports without new
metadata need regeneration for a current evidence fingerprint. No general
four-grade structured rubric configuration was introduced.

No migration, persistent credential, security-setting change, Approve, merge or
production deployment was performed. The designated sole integrator is task
`01a19a90-dfc4-77f7-9803-e9035c481026`; only it may merge/release after review and
CI. Development and production authorization come from the user's current request
that all existing issues proceed without waiting for additional evidence.

Initial setup failures were retained in task logs: services initially stopped;
empty database requires formal bootstrap (ordinary migrate correctly refused);
npm's default cache was not writable (configured workspace cache fixed it).
The first browser fixture lacked its CSS path/TooltipProvider; those fixture
errors were corrected before the recorded successful replay. These are not
claimed product failures.
