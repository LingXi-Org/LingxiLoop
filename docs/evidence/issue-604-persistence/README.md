# Historical case persistence and explicit code reading (#604)

Base: `bb1186f4` (includes merged #693). #693 fixed formula/autolink operator
handling; it did not resolve the historical case's native paragraph rendering.
No original private case JSON or production session was available or used here.

## Observed closed loops

The current `CasesPage`, `casesRouter`, `CasesApplication`, validation and access
resolver ran against a dedicated real PostgreSQL16 database. Three synthetic
unlabelled fences reproduce the known six-paragraph shape: opener plus four lines,
empty paragraph, a two-line paragraph, empty paragraph, a final code line and closer.
One variant styles the two-line paragraph italic; another escapes the source
fences intentionally. Code includes numeric operators, indentation, trailing
spaces and literal `<script>` text.

Before the patch, all three actually saved and published. The plain record read
as one code block; the styled record still read as six paragraphs with no code
block; the escaped record stayed literal. `browser-baseline.json` records those
actual API/database-backed results. The missing explicit read action was then a
failing browser regression; see `red-before.txt`.

After the patch, each case completed actual API create/publish -> open management
-> change title -> save draft -> reload/reopen -> publish -> reload/read. Versions
progressed2 ->3 ->5 (publishing first saves the current draft again). Reader
snapshots stayed unchanged before publish; stale version2 saves returned409.
The styled and escaped body/native JSON stayed identical throughout the title
edit. See `browser-result.json`.

A further run edited the native code text itself through the actual editor,
saved version6, reloaded the editor, published version8 and reloaded the reader.
Exact code, unlabelled/text language, indentation, operators and literal HTML
survived; the reader retained the prior source until publish. See
`body-edit-result.json`. Direct PostgreSQL reads independently compare final
draft/published JSON, block types, revisions and hashes in `database-result.json`.

## Minimal product change

The case reader now offers **查看代码排版 / 返回原排版** when current saved source
contains code but the resolved native reader contains no native code blocks.
This is an explicit read-only alternative using the existing case Markdown
renderer and the **current body**, never a stale legacy recovery copy. The default
view keeps canonical native blocks. The conservative automatic recovery and
editor saving behavior are unchanged; styled paragraphs are never auto-converted.
Case preview uses the same reader; other rich-text surfaces do not opt in.

The browser toggles with Enter, verifies exact code text, returns to the original
italic lines, reloads back to the original layout, and verifies identical server
responses before/after switching. Escaped literals have no switch. The390px run
has no page overflow; `code-reading-mobile.png` shows the actual control and code
container. This screenshot was inspected; cached font requests were denied by
Vite's filesystem allowlist, which was left intact. No font-specific acceptance
is claimed. Four existing strict recovery regressions, changed-file lint,
focused source typecheck (including ambient declarations) and diff check pass.
Exact-head CI and independent review are recorded separately in the PR.

## Test boundary and reproduction

This is **not** a full application/runtime bootstrap or production acceptance.
Authentication uses a loopback-only synthetic teacher identity, matching the
existing integration fixture boundary. Product membership, active seat,
entitlements and case authorization still query real tables. Object storage is
an explicitly installed recording provider; indexing/model/background workers,
real sign-in and production R2 are not exercised. The owning case import graph
was checked to contain no LingxiOS runtime imports; cached SDK3.8.16 was not used
to qualify current3.8.25. The earlier package401 was not retried or bypassed.

`prepare.py` requires a fresh dedicated container/database and applies unchanged
SQL assets for the owning case/access slice only. The immutable baseline and
relevant additive migrations are hashed in `schema-slice.json`. It does not
forge a migration ledger, native installation receipt or full-schema assertion,
and is not a production installer. No product migration or server behavior changed.

With normal repository dependencies, Node22, Docker, Python Playwright and
Chromium installed:

```sh
docker run -d --name issue604-pg --tmpfs /var/lib/postgresql/data -e POSTGRES_PASSWORD=case604-local-test-only -e POSTGRES_DB=issue604_cases_test -p 127.0.0.1:55464:5432 pgvector/pgvector:pg16
# Wait until pg_isready succeeds, then:
python docs/evidence/issue-604-persistence/prepare.py
node --import tsx docs/evidence/issue-604-persistence/server.ts
# Another shell:
LINGXILOOP_DEV_API_TARGET=http://127.0.0.1:5196 npx vite --host 127.0.0.1 --port 5198 --strictPort
# Another shell:
python docs/evidence/issue-604-persistence/browser.py
python docs/evidence/issue-604-persistence/body-edit.py
node --import tsx docs/evidence/issue-604-persistence/inspect-db.ts
```

Stop the two test processes
and remove only the container created for this replay when done. It holds only
synthetic test data in tmpfs. No production data or credentials were changed.

## Remaining scope

This safely provides code reading for the demonstrated ambiguous native shape;
it does not prove the unavailable original production body's representation or
repair historical data automatically. Default styled content intentionally stays
styled. Source already escaped or damaged is not guessed back into code. Mixed
native-code/paragraph documents with some existing native code are outside this
narrow fallback's eligibility. Arbitrary edits to the styled legacy body (rather
than the title-only preservation case) were not accepted as a historical repair.

Merge requires final-head checks/review; production deployment remains with the
existing designated sole publisher. No Approve or production deployment was
performed by this contributor. Do not describe #693 or this synthetic replay as
verification that the original private case was automatically repaired.
