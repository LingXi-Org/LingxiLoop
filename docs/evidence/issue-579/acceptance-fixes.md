# #579: retrieval copy and citation range acceptance

Base: `dade873ac04492b00c23a29a26c95fa3da5666fb`, official SDK 3.8.20,
native14/product61. No dependency, schema, security or deployment changes.
Earlier work in #581/#587/#592 is already present. The only open PR at the initial
check was #603 (Slides editor); this branch does not change its files or target.

## Production observations (read-only, 2026-10-31 UTC)

The existing authorized administrator reader inspected the dedicated acceptance
conversation. No new model turn, reconciliation, retry or production mutation
was performed. Internal conversation, run and source identifiers are omitted.

- Two search receipts return `status: completed`, `value.status: unavailable`.
  Both IM process summaries incorrectly say retrieval has completed. Native
  invocation completion and the actual retrieval result are different facts.
- The source was then listed and read twice. The two read receipts contain
  the earlier range (including `[[PAGE:2]]` and the introduction) and later range
  (including `[[PAGE:15]]`) respectively.
- The delivered IM message already binds the introduction link to the later
  range, rather than the earlier range containing the introduction.
  Its frozen excerpt begins near page15. The other links also use S2. This is
  evidence of an incorrect citation range in the delivered answer; it does not
  establish that refresh remapped a previously correct citation. The original
  live browser state was not available to this task.

## Changes and limits

New activity summaries use actual retrieval/read outcomes. Live projection,
all three run-trace projection paths, and the browser derive search copy from the saved source-status receipt, so an
old success summary no longer overrides an unavailable/no-match result. Raw
receipts, execution state and stored history remain intact; no database rewrite
or invented search/source evidence is involved.

Course-evidence guidance version3 explicitly distinguishes each excerpt/range
from the whole source, requires the supporting range's marker, and distinguishes
a later successful direct read from an earlier failed search. This is a targeted
generation instruction, **not a deterministic semantic citation validator**.
It does not repair the already delivered wrong S2 link or prove that the live
provider will select S1 correctly on a new attempt. Keep #579 open until that
Lenovo acceptance is recorded.

## Verification

- The new saved-activity regression failed on the original unconditional success
  summary, then passed with truthful search/read results, missing/thrown results,
  failed and unknown execution outcomes, and saved-display replay.
- `npm test`: 138 passed, zero failures/skips. The new multi-range regression
  retains exact page2/page15/page2 markers and excerpt bytes through projection,
  JSON/native-message persistence, a fresh run projection and IM replay.
- `CI_TEST_FILES='["server/src/__tests__/knowledge-activity.test.ts"]' npm run server:test`:
  160 passed, zero failures/skips, including old recorded search-summary recovery
  and matched/unavailable/no-match receipts across all run-trace readers.
- Web and server type checking passed; affected TypeScript lint passed.
- `node scripts/check-knowledge-citations.mjs`: real headless Chromium, production
  NativeTool/ConfidenceMarker and official assistant-ui runtime. Four search
  outcomes override old success copy; page2/page15/page2 original excerpts stay
  specific before and after an actual browser reload. Peripheral write/approval
  surfaces are inert, with synthetic receipts and source text. This does not
  exercise a provider, authorization server, or production search availability.
  The same browser fixture with the original `runActivity.ts` failed with the
  obsolete success copy; restoring the candidate passed. The original file was
  restored byte-for-byte after this temporary baseline check.

Formal3.8.20 was obtained with the environment's existing package helper; the
official archive matched the committed SHA512 and registry SHA1. No credentials
or dependency locks were changed. Local integration database tests were not run;
the PR's owning CI integration result (including the existing native citation
delivery test with page2/page15 excerpts) and independent final-commit review remain
release gates. No Approve review, merge or production deployment was submitted.
