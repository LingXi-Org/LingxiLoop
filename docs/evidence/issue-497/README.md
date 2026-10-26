# Issue #497: submission prerequisites and continuation

Issue identity: `6024784453` / `I_kwDOT8nxfs8AAAABZxrqRQ`, repository
`LingXi-Org/LingxiLoop` (`1338634622`). Author: Jane-Yuan52 (`332065931`).
Authorization was re-read from leecyang's standalone `/dot approve`, comment
[6398357296](https://github.com/LingXi-Org/LingxiLoop/issues/497#issuecomment-6398357296).
The issue remains open; its timeline had no linked implementation PR when checked.
Base: `76189b9c9996a50744d3fb9a49c02fd2138220e4` (fetched latest main).

## Observed boundary and cause

The issue's public 11-second recording shows the main Homework workflow, an
empty citation selection and an initially pending, then ready report. The header's
“提交作业” is an anchor that scrolls/focuses the workflow; it does not submit or
navigate into a conversation. Its label and silent disabled preview button do not
explain that distinction. Source inspection confirms that only the explicit
“继续学习” action selects a conversation.

`HomeworkStudent` previously enabled preview from a citation count and report
state without explaining the failed prerequisite or checking the report's cited
student message IDs. The server already requires canonical evidence covering
those sources. Selecting an unrelated complete turn could therefore enable a
preview that the server would reject. The client's retry identity also depended
only on report ID: changing references after a failed request reused the old key
with different content, conflicting with the server's content hash.

The separate screenshot demonstrates assistant generation failures, not their
cause. #439 owns that investigation: PR457 was already merged; PR491 is a draft
for restricted native diagnostics/3.8.13. Neither implementation is duplicated.
The historical forum form fix #311/PR315 was already merged; this change uses the
main Homework form. No original private conversation or production records were read.

## Change

- Label the document-header anchor “前往提交区”.
- Use one prerequisite projection for preview and submit, with actionable copy,
  a described disabled button, and an explicit focus/scroll action to references.
- Check report evidence message IDs against selected references. Old reports
  without `evidenceSources` retain the server's authoritative validation.
- Keep identical retries on the same key; corrected references/report/revision
  create a new key. Existing answer/attachment/reference state remains on failure.
- Server schema still rejects missing/empty citations before business reads;
  missing fields now receive the same useful minimum-citation message as `[]`.
  Course/tenant authorization, canonical history checks and report validation stay
  in their existing owners.

## Validation and limits

Executed focused Node regressions: **5 passed, 0 failed**. Covers empty/missing
references, bounded full-turn inputs, report-source/channel matching, pending and
stale reports, upload/answer prerequisites, unchanged retry identity and corrected
submission identity. Server schema tests mock the unused IM/permission module
boundaries and never read a database or provider.

Reproduce:

```sh
node --import tsx --experimental-test-module-mocks --test --test-force-exit \
  src/features/learning/homework/submission.test.ts \
  server/src/__tests__/homework-submission.test.ts
```

Focused Biome lint, `git diff --check`, and frontend-only Vite bundling passed
(`vite build --outDir /tmp/issue497-web-build`, 53.09s). This bundle check used
the qualified non-runtime dependencies described below; it is not a complete
locked installation or a successful `npm run build`/typecheck. The missing-field regression
failed against the old schema with an English “expected array” error, then passed.

The environment's preinstalled LingxiOS is 3.5.2, incompatible with the unchanged
3.8.12 locks. Exact `npm ci` returned registry HTTP401 for the locked package using
both available GitHub credentials. For the focused pure/schema checks, other
packages were installed from a disposable copy of the lock with only LingxiOS
omitted; no source/lock/version or runtime was substituted in this repository.
Full Web/server typechecks therefore remain blocked by the unqualified runtime.
Exact-head CI must qualify the complete locked dependency set.

Browser verification was explicitly cancelled by the parent/user on 2026-10-26.
An earlier attempted run had failed from stale/missing editor dependencies; no
browser pass is claimed. No new browser fixtures or screenshots are delivered.
Real provider recovery, the original student's final submission, production
acceptance and independent review remain unverified. No merge, deployment,
production writes or credential-file changes were performed. Release ownership
remains exclusively with `01a172a7-d557-7253-a3a2-3b9894f77010` via the parent.
