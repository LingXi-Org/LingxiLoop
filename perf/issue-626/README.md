# Startup and artifact performance — issue 626

## Scope and acceptance

The reported failures were slow homepage startup, GenUI resource timeout,
sidebar canvas opening, and serial Slides assistant/editor loading. Preserve
the existing layouts, editing, saved state, source identities, isolation,
authorization and recovery. The default target is a 50% reduction in p75
time to usable content, measured honestly per surface; this is not met for
every surface. No production merge, release or configuration change is part
of this branch. Draft PR: <https://github.com/LingXi-Org/LingxiLoop/pull/629>.

Usable means a real new-conversation dialog opens, a populated course dashboard
can navigate to the forum, a GenUI click receives an SDK state acknowledgment,
or an actual editor heading accepts editing. Loading placeholders do not count.
The separate Slides host experiment measures authorized iframe readiness while
controlled assistant dependencies are pending; it does not measure total PPT
download/parse time.

## Results and evidence

All paired comparisons alternate baseline/candidate within the same session,
with at least ten samples per arm. Each surface uses the same browser/profile
within its own comparison: 4 Mbps download, 3 Mbps upload, 20 ms latency,
CPU 1× on Windows. Results from different surfaces/browsers are not pooled.

| Surface, p75 | Baseline | Candidate | What was removed |
| --- | ---: | ---: | --- |
| Conversation homepage, real dialog | 4,958 ms | 3,253 ms | Unused message/file/diagram code |
| Learner course overview | 5,450 ms | 3,221 ms | Unused chat/course-feature imports; serial fetch |
| GenUI cold, real SDK action | 1,466 ms | 642 ms | Unused initial math renderer |
| Design cold, real editing | 6,155 ms | 5,164 ms | Duplicate external runtime |
| Design retained reopen | 152 ms | 160 ms | No additional transfer in either arm |
| Slides host readiness only | 908 ms | 94 ms | Dependency on assistant setup/code |

Detailed protocols, raw samples, screenshots, regressions and limitations:
[GenUI](genui.md), [Design](design.md), [Slides](slides.md),
[homework API](homework.md), [full-app homepage](home.md). Homepage and course
overview p75 improve **34.4%** and **40.9%**; their initial JS bytes drop by
**58.3%** and **56.6%**, respectively. Raw fixed-commit samples are in
`evidence/home-paired.json`. These two time reductions miss the 50% target.

The real 20-slide current editor still takes p75 **3.44 seconds** cold on this
network. Design's remaining 1.82 MB compressed main entry accounts for 92% of
its cold transfer, so a first cold canvas still takes about **5.16 seconds**.
Those are residual loading costs, not a claim of instant opening. Further
splitting the pinned Design program would affect synchronous preview, capture,
standalone export and fallback consumers; no capability was deleted to inflate
the result.

## Changes and deterministic guards

- Fetch learning spaces alongside authorized navigation. Route-only chat,
  file preview, course materials/forum/settings, and diagram code load when
  needed. Empty conversations do not import the message renderer, locked by
  `node perf/issue-626/startup-graph.mjs` (failed before, passed after).
- The learner overview returns only authorized persisted status/submission
  data. It performs zero private IM history reads. Teacher overview skips
  unused full detail calls. This keeps the full homework detail semantics.
- GenUI removes 639,387 decoded bytes from a no-formula initial view. Later
  formulas still load the pinned, integrity-checked renderer. Resource recovery,
  deadline and trust checks remain intact.
- Design reuses its already prepared Blob and retains the tested external and
  inline fallback paths. Cold transfer falls 2,446,997 → 1,977,246 bytes.
- Slides editor grants and assistant initialization run independently. Failure
  and retry preserve the editor. The build filter also now matches Windows
  paths; Linux already pruned those bindings, so this is not claimed as a
  production payload improvement.
- Mermaid retains the installed plugin and strict defaults; browser smoke
  verifies real SVG rendering, no renderer request for prose, and invalid
  diagram rejection. Its configuration/result/error regression is part of
  the targeted tests.

## Validation and release boundary

`npm run typecheck`, final production Vite build, 29 focused web tests,
changed-file Biome lint and `git diff --check` passed. The surface reports list
the additional native packaging and real-browser lifecycle checks. Build
warnings concern existing CSS `::highlight`, third-party annotations and large
chunks; they were not silenced.

The first CI run passed web/server/deployment-contract checks. It caught a new
integration fixture ordering mistake before the overview assertions: the
standalone draft consumed the published fixture's canned validation response.
Commit `cf7f4068` creates the published fixture first and preserves every
assertion. [CI run 41409823905](https://github.com/LingXi-Org/LingxiLoop/actions/runs/41409823905)
then passed web, server, deployment-contract and the selected database integration
checks, including the new authorization/privacy assertions. Local dependencies
and a dedicated test database remained unavailable (see `homework.md`).

Read-only production inspection found the existing main deployment successful.
A single pinned `gen-ui.js` request returned HTTP 200 in 2.447 seconds; it does
not reproduce the user's timeout or establish a percentile. PageSpeed/CrUX
lookup returned HTTP 429 quota exceeded, so no real-user metric is claimed.
Authenticated production interaction, the reporter's specific document/network,
and post-release acceptance remain unverified.

Release only through the repository's normal approved merge/deploy workflow,
then exercise the same real actions on the deployed app. This change has no
migration; rollback uses a known compatible commit via `npm run deploy`, with
durable data retained. The branch has not been merged or deployed.
