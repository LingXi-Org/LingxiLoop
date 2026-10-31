# Slides workspace evidence (#601)

Draft delivery: [PR #602](https://github.com/LingXi-Org/LingxiLoop/pull/602).
The branch includes production main `5b42a266dbc3f9cec205c8cd5fa3854c24bbce37`
(published SDK 3.8.20, native schema 14, product schema 60), and adds product
migration 61. No merge, production migration, SDK publication, deployment or
issue closure was performed by this task.

**This is not complete acceptance of #601.** Measured cold/reopen P95 fail the
requested thresholds. Full authenticated model/chat acceptance and the items
identified below remain incomplete or unverified.

## Source provenance and rebuild

| Source | Fixed commit | Complete inventory |
| --- | --- | --- |
| assistant-ui `examples/with-artifacts` and root MIT license | `ff654d8156680b839774296ef644b57ab1078425` | [14 files](../../../third_party/assistant-ui-with-artifacts/complete-manifest.json) |
| JimLiu/baoyu-design published repository, MIT and third-party notices | `c15e76ef5134228d2bb5da35652d30d7d6b8a34d` | [319 files](../../../third_party/baoyu-design/complete-manifest.json) |

Every inventoried file is checked for byte length and SHA-256. Original
`upstream/claude-design` and `upstream/claude-slides` paths are preserved; the
remaining distribution is in `distribution/`. See [attribution](../../../THIRD_PARTY_NOTICES.md),
[with-artifacts adaptation](../../../third_party/assistant-ui-with-artifacts/README.md)
and [editor maintenance](../../../third_party/baoyu-design/slides-source/README.md).

The published Node compiler preserves 321 named application factories. These
were recovered into individual modules with their function names, runtime
exports and initialization order. Nineteen video-only modules were removed;
302 application modules remain. The [provenance map](../../../third_party/baoyu-design/slides-source/source-map.json)
records original factory lines and removed modules. This is recovered JavaScript
distribution source, **not** original unpublished TypeScript. Some emitted local
names and dependency internals remain minified.

`scripts/build-slides-editor.mjs` builds the browser and Node compiler from
`slides-source/`. No upstream executable editor bundle is a build input.
The [generated manifest](editor-build-manifest.json) lists every input/output hash. Exports, PPTX and WOFF2
are lazy chunks. Generated assets are ignored and rebuilt in CI.

```sh
npm ci
npm run build:slides-editor
node --test scripts/slides-editor.test.mjs
```

Use normal repository credentials for the exact published SDK; no source clone,
substitute SDK or mock runtime replaces that dependency.

## Capability comparison against pinned upstream

“Implemented” identifies code present, not complete browser acceptance.
“Browser” means the real Chromium fixture below. “Integration” means HTTP,
PostgreSQL and Redis with the actual published SDK, fixture session identity and
fake WuKong transport; it is not a live model or real IM service.

| Capability | Owning implementation / adaptation | Evidence and remaining verification |
| --- | --- | --- |
| with-artifacts composition, left chat/right editor | `SlidesWorkspace.tsx`, `artifact-surface.tsx`, native conversation runtime | Two surface tests: split by default, presentation fullscreen, origin/revision controls. Logged-in responsive flow unverified. |
| Dedicated Agent available on open | `slides-workspace.ts`, native participant/channel/default grants | Integration: concurrent open is idempotent; distinct decks get distinct channels; leader/members persisted. Model turn and ledger entry unverified. |
| Durable conversation and old source association | `slide_workspaces`, native IM conversation | Integration: channel reused, source and file bytes unchanged. Real WuKong message-history reload unverified. |
| Page, elements/labels, text, multi-page selection, dirty state | `workspace-bridge.js`, shared schema, context API/native turn context | Browser observes actual selection, edit/present mode and save state. Integration rejects unknown fields. Saved selected file/hash accompany context; large files explicitly require `read_file`. Model-selected edits unverified. |
| Text/rich text, tables, SVG/shapes, grouping, layout, themes, ordering | Recovered `editor-*`, `model-*`, `rendering-*`, `ui-*` | Browser text edit/save; compiler parity for text, notes, tables, SVG, images and CSS. Other gestures/property controls retained but not individually browser-verified. |
| Undo/redo and durable recovery | Original history modules; content-addressed snapshots/CAS restore | Browser undo/redo/save/reopen. Integration alternating writes, stale restore refusal, restored bytes and retained later history. No pre-creation empty restore point. |
| Human/Agent conflicts | Agent `ifMatch`, fresh dirty-context guard, editor CAS | Integration rejects missing/stale hash and dirty editor; current hash succeeds atomically. Production multi-user browser flow unverified. |
| Design-system tokens/styles/templates/restyling | Recovered design-system modules; real `slides.design_systems` / `install_design_system`; namespaced files and `ds-*` references | Build/compiler support; installation enforces namespace and deck CAS. Live tool installation and restyling unverified. |
| Images/fonts, crop, replace, drag/drop, paste | Recovered image/font modules, native import and blob storage | Sample renders images on all 20 pages; compiler preserves fields. Upload/crop/font variants need individual browser coverage. |
| Page/element/area comments; send/reply/resolve | Recovered comments/host bridge, persisted comments API, dedicated-channel delivery | Existing owning tests pass in CI. Editor comment → model → editor reply flow unverified. |
| Presentation and exit to split; notes/effects | Recovered presentation modules, nonce-checked exit bridge | Browser enters presentation and exits to edit; surface test verifies fullscreen boundary. Speaker popout, phone remote and cross-window sync unverified. |
| PDF | Recovered capture/writer and native download adapter | Browser downloads real PDF. Confirmation uses a button callback under the unchanged no-forms sandbox. |
| HTML | Recovered standalone exporter | Real HTML download contains slides; legacy regression refuses active video markup/provider embeds. |
| PPTX | Recovered exporter and lazy pinned library | Real download; ZIP/content inspection verifies 20 slide XML files, integrity and no video payload. PowerPoint visual fidelity and embedded-font variant unverified. |
| PNG, current-font, notes export variants | Recovered non-video export modules | Buildable; not individually downloaded or inspected. Google Slides host delivery has no native product adapter and is not claimed. |
| Video insertion/playback/embeds/thumbnails/transcoding/export | Removed modules, worker, insertion paths and controls; editor/native import/storage reject videos | Legacy browser sample: static placeholders, no controls, zero video/provider requests, no active video in exported HTML. Storage/HTTP rejection checks included. |
| Legacy media fields | Passive compiler/model/serializer metadata | Compiler parity and browser save preserve fields. Static placeholders replace playback; historical blobs are not deleted. |
| Tenant/project/source-room authorization | Existing permissions plus derived-room membership intersection | Integration source revocation and cross-tenant denial; iframe messages validate source, nonce and schema. Full role matrix unverified. |
| Keyboard/focus/announcements/reduced motion | Recovered upstream accessibility modules, labelled native controls | Browser text editing, Escape, undo/redo. Screen reader, mobile keyboard and full focus traversal unverified. |
| Other native workspace capabilities | Normal default capability grants retained | Generic multi-agent artifact assignment/shared-state/report execution still scopes to the source conversation; use from a new dedicated room is **not adapted or accepted** in this draft. |

The complete archive still includes `gen-video` and original video references.
It is a provenance archive, not an installed skill directory. Product registration
explicitly exposes `claude-design` and `claude-slides`; reference reads use
per-skill allowlists plus design-system references. There is no native
`gen-video` tool or skill loader for `distribution/`. This is not a claim of
“zero video files in the repository.”

## Compatibility and migration

`0061_slides_workspaces.sql` adds workspace binding, per-person context,
content-addressed file versions and revision manifests. Opening an old deck
creates a separate conversation without changing `artifacts.conversation_id`
or its file bytes. History starts on the first post-upgrade save; it cannot
recreate earlier edits. Restore is a new atomic save with a current-version
check and preserves later checkpoints. The UI lists the latest 100 revisions;
stored records are retained.

Cross-runtime files: `agent-runtime/context.ts`, `agent-runtime/conversations.ts`,
`modules/access/repository.ts`, `db/migrate.ts`, `db/runtime-profile.ts`,
`db/runtime-patch.ts`, `deploy/runtime-patch.mjs`, and owning bootstrap/historical
tests. The exact 61-file inventory is recognized only with published SDK 3.8.20;
native schema remains 14. Historical 3.8.18 → 3.8.19 → 3.8.20 fixtures retain
their exact 60-migration prefix. SDK ledger CAS checks stay strict; product 61
is an ordinary forward migration after runtime 20 is installed. Unknown
inventories/mismatched SDKs are refused. Production has not run migration 61 here.

## Real browser measurements

Raw comparable results: [baseline](editor-baseline.json), [candidate](editor-candidate.json).
Every sample and browser error is retained. [Initial baseline](editor-baseline-initial.json)
had concurrent local build contention and is excluded. Final comparable runs
were sequential without concurrent local builds/tests.

Chromium 154, Linux, AMD EPYC 9V74 (5 available logical CPUs), 1440×1000 at scale
1, no CPU throttling; 20 ms latency, 4 Mbps down, 3 Mbps up, gzip. Throttling
applies to parent and out-of-process iframe sessions. The opaque sandbox has no
`allow-same-origin`. The fixed sample has 20 pages, each with text, notes and the
same 640×360 SVG image. File/image hashes are recorded. These are not 20 distinct
photographic images.

Cold creates a fresh browser context; reopen navigates the host in the same
context and mounts a new sandboxed editor. Timing begins at iframe navigation
and ends after a visible loaded image and a real double-click entering text
editing. Product authentication/workspace API/chat startup/model waiting are
excluded. Asset cache headers are enabled, but most assets still transfer on
opaque-frame reopen; this is not reported as a warm-cache hit. Editing measures
trusted `beforeinput` through two animation frames, checking the changed text.

| Metric | Baseline P50 / P75 / P95 | Candidate P50 / P75 / P95 | Target |
| --- | --- | --- | --- |
| Cold to editable (ms) | 3,791.0 / 3,802.1 / 3,875.0 | 3,490.7 / 3,528.0 / 3,578.5 | P95 ≤2,000: FAIL |
| Reopen to editable (ms) | 3,441.4 / 3,461.6 / 3,508.1 | 3,162.8 / 3,179.7 / 3,223.8 | P95 ≤1,000: FAIL |
| Text edit feedback P95 (ms) | 64.4 | 44.4 | ≤100: PASS (fixture) |
| Cold transferred bytes | 1,503,666.00 / 1,503,666.00 / 1,503,666.00 | 1,374,066.00 / 1,374,066.00 / 1,374,066.00 | Diagnostic |
| Cold JS execution (ms) | 517.44 / 522.94 / 580.32 | 489.85 / 520.54 / 566.40 | Diagnostic |
| Cold JS heap (MiB) | 20.39 / 20.42 / 20.44 | 19.07 / 19.11 / 19.14 | Diagnostic |
| Reopen transferred bytes | 1,443,486.00 / 1,443,486.00 / 1,443,486.00 | 1,313,886.00 / 1,313,886.00 / 1,313,886.00 | Diagnostic |
| Reopen JS execution (ms) | 257.03 / 293.45 / 302.12 | 240.38 / 259.00 / 289.38 | Diagnostic |
| Reopen JS heap (MiB) | 28.53 / 33.28 / 33.30 | 32.24 / 32.24 / 32.26 | Diagnostic |

Requested P95: cold ≤2,000 ms; reopen ≤1,000 ms; editing ≤100 ms. Cold/reopen
are not accepted. Payload reduction and lazy exports are implemented; further
loading/cache work remains. Only user-requested video capabilities were removed.

`ScriptDuration` measures execution, not isolated parsing. Separate V8 parse
time is **unmeasured**; JS heap is not total browser RSS. A separate [engine metric probe](editor-runtime-metrics.json) reports CDP
`V8CompileDuration` of 2.115 ms cold and 0.052 ms reopen (one sample each); this
is not a separate parse trace or a P95. Full authenticated
product/production P95 are unmeasured. With 10 observations, nearest-rank P95 is
the maximum; this small sample is not a confidence bound.

```sh
node scripts/slides-workspace-benchmark.mjs --runs=10 --label=candidate --out=/tmp/slides-candidate.json
node scripts/slides-workspace-benchmark.mjs --runs=1 --regression=true --legacy=true --exports-dir=/tmp/slides-exports --out=/tmp/slides-legacy.json
```

For baseline, build `build:slides-editor` in a separate checkout of
`6dccecaac52e0f281263ee24ee1789151c5ed962`, and point this harness's `--editor`
at that checkout's `server/assets/slides-editor`. Use the same harness/browser
and settings. `--chrome=/path/to/chromium` overrides `/usr/bin/chromium`.

[Legacy regression](editor-legacy-regression.json) records save, undo/redo,
saved reopen, presentation exit, three download hashes and absent video requests.
The [download inspection](export-validation.json) checks those same hashes:
PDF has 20 pages (pypdf), HTML has 20 slide containers and no video elements
(Python HTMLParser), and PPTX has 20 slide XML entries with valid ZIP CRCs and
no video payloads/relationships (Python zipfile).
Its transfer counts include exports/reload and are excluded from performance
comparison. [Earlier regular regression](editor-regression.json) predates the
final video-helper cleanup and is supplemental, not final-candidate evidence.

## Checks and remaining gates

- Source build, translation, archive integrity and compiler parity: 5/5.
- Split/presentation surface checks: 2/2.
- Migration/deployment-plan and packaging owning checks: 40/40 locally.
- Local web/server lint passed; web retains existing warnings.
- Published-SDK CI [41170584525](https://github.com/LingXi-Org/LingxiLoop/actions/runs/41170584525)
  at `0cb377ea` passed web, server, integration and deploy-contract. Later changes
  require final-candidate CI linked in the PR; this earlier green run alone is
  not final-commit evidence.
- Local whole-product typechecks/runtime were blocked by GitHub Packages HTTP
  401 for exact `@lyyzka/lingxios@3.8.20`. No credential changes or SDK substitution
  were made. CI installs the real package and supplies product validation; no
  user credential change is requested.
- Remaining acceptance: cold/reopen performance, separate parsing measurement,
  authenticated model/comment/message-history flow, matrix variants, generic
  cooperation in dedicated rooms and integrator independent review. No production
  acceptance is claimed.
