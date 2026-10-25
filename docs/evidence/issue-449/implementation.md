# Cases authoring, automatic covers and logical deletion (#448 / #449 / #451)

Development baseline: `9e3bfd892fa53f22dddbc00e98f466c21ce01b7d`. The reported production
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
  no historical cover generation or backfill is performed.

- Manager cards and detail menus offer a controlled, title-specific deletion
  confirmation. Cancellation sends no request; busy controls prevent duplicates;
  a failed request retains the case and permits retry. Acknowledged deletion
  removes the row and returns detail to the management list, preserving filters.
- Versioned `DELETE /cases/:id` checks organization and current management rights
  under the existing transaction locks. Migration 0057 adds `deleted_at`; original
  snapshots and attachments remain stored. Tombstones disappear from reads,
  retrieval and direct assets; source invalidation and cover cancellation fence
  pending work and late worker completions. See [deletion evidence](../issue-451/implementation.md).

## Executed checks

- **31/31** owning PostgreSQL/HTTP integration checks passed, zero skipped:
  organization cases (15), case covers (13), product55 migration (2) and
  product57 migration (1). The added HTTP case saves an
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
  passed. Runtime boundary checks passed **8/8**. The initial CI image graph
  check identified missing crop geometry in the Docker context; the exact
  source allowlist entry was added and the owning image graph check passed.
  Focused E2E typecheck and official collection selected one workflow.
- [HTTP fixture receipt](http-results.json): one synthetic case, six contract
  groups, eight fixed cover states, one acknowledged soft deletion, zero model calls. Fixed SVG/program assets
  are transport/state fixtures, not proof of live model generation.

## Remaining acceptance

[Browser preflight](browser-preflight-and-checks.json) found the Chromium SUID
sandbox helper owned by `nobody:nogroup`, with no installed safe alternative or
existing browser session. No browser launch or security-setting change was
attempted. Browser assertions, screenshots, same-size before/after comparisons
and homepage hover recordings are all **unexecuted**. A valid normal-sandbox
browser is required to run the prepared [single workflow](browser-acceptance.md).

No independent review, other issue work, merge, deployment, production data read
or production write was performed. Product changes stay within cases authoring, deletion, cover presentation/coordinates
and bounded polling, plus the owning migration/runtime detection and Docker source
context. Original assets are retained; derived index cleanup follows existing policy.

The sole release coordinator must supply an exact product57 upgrade/release profile
before production rollout; current host-release contracts stop at product56. This
branch does not relax them or execute production migrations.
