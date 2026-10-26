# Case historical blocks and Markdown round trips (#498 / #499)

Base: `76189b9c` (latest main at branch creation). Issue identity deduplication:
#498 = `6026015752` / `I_kwDOT8nxfs8AAAABZy20CA`;
#499 = `6026135720` / `I_kwDOT8nxfs8AAAABZy-IqA`.
Both original authors are `lyyzka`, allowed by the task. Original issues, comments,
#375 closure and #380 discussion/merge were reread. #380 merged as
`9b2cc3fed2e75b36069b7001c1418084db956201`; its completed work is not claimed again.
No existing #498/#499 fix PR was found before development.

## Confirmed code defects and scope

- `usableDocument` checks projection equality, not code semantics. A matching body
  with a fenced source stored as plain paragraphs bypassed Markdown parsing in
  both reading and editing. This is a reproduced structural failure mode, **not
  proof that the user's unavailable historical record has this exact shape**.
- Case plain-code paste used BlockNote's default conversion, while legacy imports
  used the existing ReactMarkdown/GFM HTML adapter. Code paste now shares that
  adapter and the official BlockNote HTML parser. Native/rich HTML/file clipboard
  data and paste inside an existing code selection keep their existing behavior.
- Installed BlockNote 0.56.0 `htmlToMarkdown.serializeCodeBlock` removes one terminal
  LF (`code.endsWith("\n") ? code.slice(0, -1) : code`). The case projection adapter
  compares existing Markdown AST code values with native code and restores only
  that verified LF difference. HTML remains escaped text; no raw-HTML execution,
  dependency, third parser, API contract or production schema change was added.
- Verified historical repairs replace only exact, unique plain paragraph runs
  matching a complete top-level fence in the **current matching body/projection**.
  Remaining native blocks and the first paragraph's ID are retained. Code text
  must exactly match the existing Markdown AST after official import, or repair
  is rejected. The reader applies it in memory; the editor passes it to the form
  so explicit save persists it even with only a title edit. Legacy-only and stale
  projection imports likewise reach the form on load.

The recovery deliberately leaves escaped prose, stale `legacyMarkdown`, styled
inline-code paragraphs, unclosed/nested historical fences and ambiguous duplicate
matches untouched. It never restores stale original text over current content.
The LF adapter leaves unmatched native/Markdown code sequences unchanged (for
example a mixed export containing a diagram that also emits a code fence). Those
ambiguous shapes require a reviewed sample, not an automatic conversion claim.

## Validation

- 12/12 focused Node tests pass: historical paragraph recovery, preserved native
  content and IDs, idempotence, ambiguity/stale-source rejection, code LF/blank
  lines/tabs/trailing spaces/backticks/HTML, safe shared import and clipboard paths.
- Restoring the exact main `paste.ts` with the new regression makes it fail with
  `code must use common import`; see `main-paste-regression.txt`. A pass-through
  recovery control also fails the historical structure assertion. This is unit
  evidence; no browser semantic failure is claimed.
- 1/1 selected real HTTP/PostgreSQL integration passes in the disposable local
  `lingxiloop_cases_browser_test` database. The same persisted bad document is
  published, replaced with a supplied native repair result in a draft, reloaded,
  explicitly published and saved again. It verifies exact text/JSON preservation,
  unchanged reader snapshot before publish, optimistic version conflict and
  repeat-save equality. It supplies native import JSON rather than running the
  browser editor; parser adaptation has separate unit coverage. The fixture logs
  an asynchronous audit write after pool teardown; assertions and exit status
  pass. No production service, model or database is contacted.
- Web/Server typecheck, lint and the production Web build pass. Exact PR CI is reported in the PR.

Reproduce focused units:

```sh
node --import tsx --test src/features/content-editor/fenced-code.test.ts src/features/content-editor/code-projection.test.ts src/features/content-editor/code-block.test.ts src/features/content-editor/paste.test.ts src/features/cases/CaseCodeBlock.test.tsx
```

Select only `historical code repair` in
`server/src/__integration__/organization-cases.test.ts` using Node's
`--test-name-pattern` with the existing isolated integration fixture environment.
The fixture truncates only a dedicated local test database. Use locked published
packages; remove stale nested development dependencies that shadow the root lock.

## Unverified acceptance and updated instruction

The user's latest instruction cancels cloud browser/screenshot/DOM visual
acceptance, overriding the issue's original browser checklist. No browser pass,
visual result or screenshot acceptance is claimed. An earlier attempt stopped at
an outdated fixture Better Auth endpoint (404) before the case UI; it is not code
regression evidence. No browser work continued after cancellation.

No real old/new case URL, body/blocks sample, screenshot attachment or actual
published revision has been provided. One consolidated request is on
[#499](https://github.com/LingXi-Org/LingxiLoop/issues/499#issuecomment-6408004896);
#498 was not asked again. Actual historical shape, live version, reader/editing
behavior, copy, responsive/theme presentation and post-release acceptance remain
unverified. Do not close either issue on synthetic unit/API results alone.

## Production conversion proposal — not executed

No bulk write, production read, migration, credential change, merge or deployment
is part of this branch. The designated parent-session publisher owns release.

1. After samples identify the real shape, an authorized operator exports only
   approved case IDs and their current management/published versions. Retain the
   original JSON snapshots privately; record case/tenant ID, source version,
   body/document SHA256, operation ID and tool/commit identity in a restricted
   audit manifest. Do not publish private text in GitHub.
2. Dry-run the same `recoverFencedCode` and existing official import boundary on
   those snapshots. Emit proposals only when code text is exact and other blocks
   are unchanged. Record before/after hashes, retained/removed block IDs and the
   reason for every skip; require human review of the concrete proposals. Missing
   or mismatched projection follows explicit normal import review, never a blind
   `legacyMarkdown` replay.
3. Apply reviewed proposals only through the ordinary management save API with
   the captured current version (CAS). On conflict, stop that item and regenerate
   from a fresh snapshot. Save drafts first; never overwrite the published snapshot
   or silently republish. Fetch management and reader snapshots again and audit
   both versions/hashes against the proposal.
4. Re-running recovery on an accepted native result is a no-op. A completed
   operation/version/hash tuple is skipped. Publication is a separate explicitly
   authorized step with its own version receipt; verify the actual reader result.
   Retain the original snapshots for a separately reviewed restoration proposal.

This is an idempotent, auditable plan, not authorization to operate production.
