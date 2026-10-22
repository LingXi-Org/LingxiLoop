# Issue 304: answer-first activity presentation

Baseline: `d5481cd258058784e7004169b5ef1235460384f1`, formal LingxiOS 3.8.2,
native schema 14 / product schema 53. This document precedes implementation.

## Failure model and ownership

| Boundary | Failure to prevent | Required evidence | Owner |
| --- | --- | --- | --- |
| Public projection | Accepted source disappears before committed message reads; source identity changes; stale/superseded text becomes an answer | Actual v2 events through product projection and AssistantTransport; explicit accepted source identity | contract304 |
| Classification and DOM | Tool groups interrupt answers; rich result is hidden by appearance; accepted handoff remounts text/visualization; copy/feedback attach to process | Exclusive body/process/attention classification; original PartByIndex; stable DOM during handoff; legacy unknown remains visible | layout304 / browser304 |
| Interaction ownership | Tool interrupt and harness goal render two actionable forms; old approval or page gains permission | One current owner per run/request/interaction; one resume; history read-only; current authorization checked on submit | layout304 / browser304 |
| Public history | Snapshot bounds hide older work; stale pages replace live data or resurrect actions; repeated cursors loop; arrival order changes ordering | More than 80 activities plus structural bound; retry/race/run switch/live update; stable identity/order/revision; page-only store | history304 / browser304 |
| Hierarchy | Names/timestamps/LLM spans invent business tasks | Only validated public agent/child-run and parent relationships; missing relationships stay flat | contract304 / elements304 |
| Official components | Custom styling is misrepresented as official source; diagnostics dominate the answer | Official TaskCard source, commit and license; existing RunActivity controlled-open behavior; waterfall under secondary run details | elements304 |
| Sources | One search has duplicate lists; URL-only dedup loses versions/fragments/chunks | One inspectable process source list; exact provenance distinct; final citations remain accessible | elements304 / contract304 |
| Compatibility | Changes regress 295–298/302, raw reasoning leaks, schema/fence validation weakens | Focused existing message/trace/questionnaire/visualization/quote checks, unchanged formal runtime and schema pins | root integration |
| Browser | Narrow layouts overflow; keyboard/focus/reduced motion fail; updates force open/close or scroll | Official tester-army/e2e engine, 390px light/dark, actual interactions and saved artifacts on integrated candidate | browser304 / root |

## Acceptance and evidence rules

- Task inspection must select an already visible authorized trace span through the
  same secondary details entry. Missing child tool content never triggers new reads.
  Re-selecting a task may reveal its ancestors only after the user's explicit click;
  ordinary trace updates must preserve manually collapsed state. Archived labels
  never replace the latest current-step summary.

- New tests first demonstrate the owning baseline failures. Agent-specific failure
  models and commands record exact pass/fail counts.
- Real v2 product-projection tests and local controlled browser scenarios are
  reported separately from static fixtures. None is production acceptance.
- An explicit producer/result contract classifies content. Text wording, richness,
  timing adjacency, and hidden reasoning are never used to infer intent or tasks.
- History pages cannot replace the live message, answer, run state, or permissions.
- Keep immutable public text/fence/IM identities, bounded wire schemas, questionnaire
  persistence and idempotence, and source-backed visualization activation.
- The integrated candidate needs focused checks, independent review and exact-head
  CI. The sole integrator opens/merges the PR with `[skip deploy]` and collects the
  immutable image receipt. This issue stays open until actual deployment and acceptance.

## External boundary

Production MCP `POST https://admin.lingxilearn.cn/api/mcp` was denied with HTTP 403 /
Cloudflare 1010 (`browser_signature_banned`); the production health URL was also
denied. Those operations are not retried or routed around. No production deployment,
private-record reads, model/index migration, credential changes or access expansion
are part of this implementation. All local fixtures use synthetic data.

## Review finding: data-only delivery

A strict data part cannot carry activity annotation. A valid presentation artifact
can therefore be visibly delivered while HarnessDetails incorrectly says no answer
was produced. Before fixing, render partial/blocked data-only results through the
actual conversation renderer. Preserve the incomplete state, recognize only valid
result descriptors or persisted artifact deliveries, and retain the no-answer
error for citation/process-only content.

## Distribution attribution

The source repository retains official Elements and quoted-reply MIT notices,
but the production Docker context currently excludes them. Verify the final image
COPY and context include their notices in served licenses, and a license-only
change selects the Web build/image. Preserve the pinned source snapshots.
