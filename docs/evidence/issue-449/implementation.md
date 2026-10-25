# Cases authoring and automatic cover continuation (#448 / #449)

Baseline: `9e3bfd892fa53f22dddbc00e98f466c21ce01b7d`. The reported production
failure affecting all draft saves/publications has **not been reproduced**;
the original account, browser and error remain unidentified. This change fixes
observable code gaps and provides a runnable, isolated acceptance fixture. It
does not assert that every original incident or visual requirement is verified.

## Changes

- Draft save keeps the editor/input and adopts the acknowledged ID/version.
  A successful save no longer issues a second detail read that could overwrite
  the successful outcome with a load error. Further editing clears the saved
  notice. Publish uses the latest save receipt, and failures distinguish unsaved
  input from a saved draft whose publication failed. Obsolete scope completions
  remain fenced. The two form controls explicitly select draft or publish.
- Generated covers remain visible in editing and preview. Pending metadata can
  update while editing without replacing unsaved content. Neutral empty artwork,
  local generation progress, manager retry and separate asset reload replace
  the upload-first appearance. Manual fallback images are secondary menu actions.
- Static and VM image layers share centered `object-fit: cover`; pointer mapping
  uses the same maximum scale and cropped offsets. The first pointer position is
  retained through asynchronous VM startup. Mouse hover owns activation, with
  no interaction toggle; pointer exit, offscreen/background budgets, touch and
  reduced-motion static fallbacks preserve the existing resource boundary.
- Polling is bounded to 10 minutes/64 reads per session, survives transient read
  errors, and resumes via a local refresh action or a stopped session becoming
  visible/online. It does not enqueue or regenerate anything.
- Historical cover backfill UI and its unused browser API facade are removed.
  Existing historical rows are untouched. The server endpoint is not invoked;
  permission rules, queue/worker generation, storage and schema are unchanged.

## Executed checks

- **26/26** owning PostgreSQL/HTTP integration checks passed, zero skipped:
  organization cases (13) and case covers (13). The added HTTP case saves an
  incomplete draft, rejects empty publication without losing it, then persists
  matching native summary/body and publishes the acknowledged version while
  its automatic cover is still pending. Existing worker-delay/failure,
  publication, version, reader and organization isolation tests remain green.
- **40/40** focused frontend tests passed: submission (10), view/API (3), cover
  presentation/crop/session (14), polling and recovery (13). New presentation
  and polling regressions failed against their old behavior before the fix.
  Submission tests establish orchestration behavior; their initial missing
  helper failure is not evidence of reproducing the reported production fault.
- Web build (including typecheck), server typecheck, scoped lint and diff checks
  passed. Focused E2E typecheck and official collection selected one workflow.
- [HTTP fixture receipt](http-results.json): one synthetic case, five contract
  groups, eight fixed cover states, zero model calls. Fixed SVG/program assets
  are transport/state fixtures, not proof of live model generation.

## Remaining acceptance

[Browser preflight](browser-preflight-and-checks.json) found the Chromium SUID
sandbox helper owned by `nobody:nogroup`, with no installed safe alternative or
existing browser session. No browser launch or security-setting change was
attempted. Browser assertions, screenshots, same-size before/after comparisons
and homepage hover recordings are all **unexecuted**. A valid normal-sandbox
browser is required to run the prepared [single workflow](browser-acceptance.md).

No independent review, other issue work, merge, deployment, production data read
or production write was performed. Product changes are restricted to the cases
page/API/submission helper, cover presentation/coordinates and bounded polling;
server changes consist only of the focused integration regression.
