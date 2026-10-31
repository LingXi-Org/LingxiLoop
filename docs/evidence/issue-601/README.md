# Slides workspace evidence (#601)

Draft delivery: [PR #602](https://github.com/LingXi-Org/LingxiLoop/pull/602).
The branch includes production main `5b42a266dbc3f9cec205c8cd5fa3854c24bbce37`
(published SDK 3.8.20, native schema 14, product schema 60), and adds product
migration 61. No merge, production migration, SDK publication, deployment or
issue closure was performed by this task.

**This is not complete acceptance of #601.** Cold and fresh-iframe reopen P95
still fail the requested thresholds. Retained-frame reopen is separately measured
at 204.7 ms P95 against an authorization HTTP fixture. Real isolated credential login, model editing,
comment reply and dedicated-room cooperation are now exercised. Production IM/storage
and the individual variants identified below remain unverified.

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
The [final generated manifest](editor-final-build-manifest.json) lists every input/output hash. Exports, PPTX and WOFF2
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
recording HTTP WuKong transport. A separate live-model check below uses actual
Better Auth credential login, the control-plane Worker and a metered model; it
still does not use the production IM service or object store.

| Capability | Owning implementation / adaptation | Evidence and remaining verification |
| --- | --- | --- |
| with-artifacts composition, left chat/right editor | `SlidesWorkspace.tsx`, `artifact-surface.tsx`, native conversation runtime | Two surface tests: split by default, presentation fullscreen, origin/revision controls. Logged-in responsive flow unverified. |
| Dedicated Agent available on open | `slides-workspace.ts`, native participant/channel/default grants | Integration: concurrent open is idempotent; distinct decks get distinct channels; leader/members persisted. Real authenticated model turn, native tools, saved read-back, answer replay and ledger receipts passed in the isolated live check. |
| Durable conversation and old source association | `slide_workspaces`, native IM conversation | Integration: channel reused, source and file bytes unchanged. Real WuKong message-history reload unverified. |
| Page, elements/labels, text, multi-page selection, dirty state | `workspace-bridge.js`, shared schema, context API/native turn context | Browser observes actual selection, edit/present mode and save state. Integration rejects unknown fields. Saved selected file/hash accompany context; large files explicitly require `read_file`. Real model changed the selected page title while preserving body and notes. |
| Text/rich text, tables, SVG/shapes, grouping, layout, themes, ordering | Recovered `editor-*`, `model-*`, `rendering-*`, `ui-*` | Browser text edit/save; compiler parity for text, notes, tables, SVG, images and CSS. Other gestures/property controls retained but not individually browser-verified. |
| Undo/redo and durable recovery | Original history modules; content-addressed snapshots/CAS restore | Browser undo/redo/save/reopen. Integration alternating writes, stale restore refusal, restored bytes and retained later history. No pre-creation empty restore point. |
| Human/Agent conflicts | Agent `ifMatch`, fresh dirty-context guard, editor CAS | Integration rejects missing/stale hash and dirty editor; current hash succeeds atomically. Production multi-user browser flow unverified. |
| Design-system tokens/styles/templates/restyling | Recovered design-system modules; real `slides.design_systems` / `install_design_system`; namespaced files and `ds-*` references | Build/compiler support; installation enforces namespace and deck CAS. Live tool installation and restyling unverified. |
| Images/fonts, crop, replace, drag/drop, paste | Recovered image/font modules, native import and blob storage | Sample renders images on all 20 pages; compiler preserves fields. Upload/crop/font variants need individual browser coverage. |
| Page/element/area comments; send/reply/resolve | Recovered comments/host bridge, persisted comments API, dedicated-channel delivery | Existing owning tests pass in CI. Real HTTP editor comment → native event worker → dedicated room → live model → persisted reply/resolve → editor snapshot passed. Visual pin gestures remain individually unverified. |
| Presentation and exit to split; notes/effects | Recovered presentation modules, nonce-checked exit bridge | Browser enters presentation and exits to edit; surface test verifies fullscreen boundary. Speaker popout, phone remote and cross-window sync unverified. |
| PDF | Recovered capture/writer and native download adapter | Browser downloads real PDF. Confirmation uses a button callback under the unchanged no-forms sandbox. |
| HTML | Recovered standalone exporter | Real HTML download contains slides; legacy regression refuses active video markup/provider embeds. |
| PPTX | Recovered exporter and lazy pinned library | Real download; ZIP/content inspection verifies 20 slide XML files, integrity and no video payload. PowerPoint visual fidelity and embedded-font variant unverified. |
| PNG, current-font, notes export variants | Recovered non-video export modules | Buildable; not individually downloaded or inspected. Google Slides host delivery has no native product adapter and is not claimed. |
| Video insertion/playback/embeds/thumbnails/transcoding/export | Removed modules, worker, insertion paths and controls; editor/native import/storage reject videos | Legacy browser sample: static placeholders, no controls, zero video/provider requests, no active video in exported HTML. Storage/HTTP rejection checks included. |
| Legacy media fields | Passive compiler/model/serializer metadata | Compiler parity and browser save preserve fields. Static placeholders replace playback; historical blobs are not deleted. |
| Tenant/project/source-room authorization | Existing permissions plus derived-room membership intersection | Integration source revocation and cross-tenant denial; iframe messages validate source, nonce and schema. Full role matrix unverified. |
| Keyboard/focus/announcements/reduced motion | Recovered upstream accessibility modules, labelled native controls | Browser text editing, Escape, undo/redo. Screen reader, mobile keyboard and full focus traversal unverified. |
| Generic multi-agent cooperation | Effective execution conversation separate from immutable source; eligible source agents inherited into the dedicated room | Integration covers outsider refusal, assignment dispatch through the actual native event worker/HTTP IM, shared state, builder/verifier evidence, completion and reopened room. Legacy in-flight work stays in its original room. |

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
or its file bytes. Nullable `artifacts.execution_conversation_id` chooses the room
for new cooperation; it is not backfilled. An existing active assignment keeps
its source room. A database trigger permits only that source or the exact
workspace binding in the same project/tenant. Assignments, reports, claims,
completion events and the native event worker use this effective room; comments
use the dedicated room when present. No agent is implicitly admitted outside
its current authorized membership. History starts on the first post-upgrade save; it cannot
recreate earlier edits. Restore is a new atomic save with a current-version
check and preserves later checkpoints. The UI lists the latest 100 revisions;
stored records are retained.

Cross-runtime files: `agent-runtime/context.ts`, `agent-runtime/conversations.ts`,
`modules/access/repository.ts`, `agents/native-event-worker.ts`, `db/migrate.ts`, `db/runtime-profile.ts`,
`db/runtime-patch.ts`, `deploy/runtime-patch.mjs`, and owning bootstrap/historical
tests. The exact 61-file inventory is recognized only with published SDK 3.8.20;
native schema remains 14. Historical 3.8.18 → 3.8.19 → 3.8.20 fixtures retain
their exact 60-migration prefix. SDK ledger CAS checks stay strict; product 61
is an ordinary forward migration after runtime 20 is installed. Unknown
inventories/mismatched SDKs are refused. After migration, an old product60-only
binary is not a supported rollback target; use a compatible product61 build and
fix forward without removing durable data. Production has not run migration 61 here.

## Real browser measurements

Raw final comparable results: [baseline repeat](editor-baseline-repeat.json),
[candidate `99369639`](editor-final-performance.json). Earlier [baseline](editor-baseline.json)
and [candidate `0cb377ea`](editor-candidate.json) remain as historical evidence.
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

| Metric | Baseline P50 / P75 / P95 | Candidate `99369639` P50 / P75 / P95 | Target |
| --- | --- | --- | --- |
| Cold to editable (ms) | 3,758.9 / 3,781.6 / 3,803.7 | 3,354.8 / 3,382.8 / 3,396.6 | P95 ≤2,000: FAIL |
| Fresh-iframe reopen to editable (ms) | 3,431.8 / 3,442.7 / 3,535.3 | 3,040.6 / 3,067.0 / 3,102.7 | P95 ≤1,000: FAIL |
| Text edit feedback P95 (ms) | 53.5 | 78.1 | ≤100: PASS (fixture) |
| Cold transferred bytes | 1,503,666.00 / 1,503,666.00 / 1,503,666.00 | 1,321,427.00 / 1,321,427.00 / 1,321,427.00 | Diagnostic |
| Cold JS execution (ms) | 497.74 / 521.19 / 524.33 | 451.22 / 482.91 / 489.25 | Diagnostic |
| Cold JS heap (MiB) | 20.39 / 20.42 / 20.44 | 17.64 / 17.69 / 17.80 | Diagnostic |
| Reopen transferred bytes | 1,443,486.00 / 1,443,486.00 / 1,443,486.00 | 1,261,247.00 / 1,261,247.00 / 1,261,247.00 | Diagnostic |
| Reopen JS execution (ms) | 248.30 / 255.28 / 311.56 | 226.39 / 249.45 / 278.09 | Diagnostic |
| Reopen JS heap (MiB) | 33.27 / 33.28 / 33.29 | 30.54 / 30.54 / 30.55 | Diagnostic |

Requested P95: cold ≤2,000 ms; reopen ≤1,000 ms; editing ≤100 ms. Cold/fresh-iframe reopen
are not accepted. Payload reduction and lazy exports are implemented. The latest build also omits
4,374 unconsumed browser runtime getters (all initializers and Node exports are
retained). The product now keeps at most one workspace mounted while showing
the deck list, reauthorizes before revealing it, and releases it on deck/project
switch, removal or access denial. A separate same-frame metric is reported below;
it does not replace this fresh-navigation comparison. Further cold-loading work
remains. Only user-requested video capabilities were removed.

The candidate's separate [retained-frame group](editor-retained-performance.json)
result is P50/P75/P95
180.9/187.0/204.7 ms. The host moves focus out and hides the existing iframe,
then measures a new authorization HTTP request under the same network throttle,
revealing the frame and entering real text editing. This is the product's new
recent-deck cache behavior, not a new navigation; actual product authorization
latency is excluded. [Lifecycle regression](workspace-retention.json) separately
checks the real React page's reuse and revocation behavior. It is not a claim
that every authenticated/production reopen is ≤1 second. This group inserts a
retention step between cold and fresh navigation, so its cold/reopen/edit numbers
are supplemental. The main comparison above uses the identical two-phase
sequence for baseline and candidate, with no intermediate cache interaction.

`ScriptDuration` measures execution. A separate [V8 trace](editor-final-parse-trace.json)
now records parse/compile events for the editor renderer identified from its
actual document URL. Cold main-thread `V8.ParseProgram` spans total 54.738 ms;
`V8.ParseFunction` spans total 96.312 ms. These are event-specific diagnostics,
not additive phases or P95s. Streaming parse spans also contain network waits,
so they must not be summed as CPU parsing time. The instrumented one-run trace
is excluded from the 10-run comparison. Fully isolated all-script parse wall
time remains unmeasured. JS heap is not total browser RSS. The earlier
[CDP engine probe](editor-runtime-metrics.json) remains supplemental.
At this fixed bandwidth the current 1,321,427-byte cold transfer alone has a
2.64-second throughput lower bound before processing/latency. Meeting 2 seconds
therefore still needs a substantial reduction in the critical loading path;
minifier/static-linking experiments were not shipped as unverified replacements.
Full authenticated product/production P95 are unmeasured. With 10 observations,
nearest-rank P95 is the maximum; this small sample is not a confidence bound.

```sh
node scripts/slides-workspace-benchmark.mjs --runs=10 --label=candidate --out=/tmp/slides-candidate.json
node scripts/slides-workspace-benchmark.mjs --runs=10 --retained=true --label=retained --out=/tmp/slides-retained.json
node scripts/slides-workspace-benchmark.mjs --runs=1 --trace=true --label=profile --out=/tmp/slides-parse.json
node scripts/check-slides-retention.mjs
node scripts/slides-workspace-benchmark.mjs --runs=1 --regression=true --legacy=true --exports-dir=/tmp/slides-exports --out=/tmp/slides-legacy.json
```

For baseline, build `build:slides-editor` in a separate checkout of
`6dccecaac52e0f281263ee24ee1789151c5ed962`, and point this harness's `--editor`
at that checkout's `server/assets/slides-editor`. Use the same harness/browser
and settings. `--chrome=/path/to/chromium` overrides `/usr/bin/chromium`.

[Final legacy regression](editor-final-regression.json) records save, undo/redo,
saved reopen, presentation exit, three download hashes and absent video requests.
The [final download inspection](export-final-validation.json) checks those same hashes:
PDF has 20 pages (pypdf), HTML has 20 slide containers and no video elements
(Python HTMLParser), and PPTX has 20 slide XML entries with valid ZIP CRCs and
no video payloads/relationships (Python zipfile).
Its transfer counts include exports/reload and are excluded from performance
comparison. [Earlier regular regression](editor-regression.json) predates the
final video-helper cleanup and is supplemental, not final-candidate evidence.
The earlier [legacy regression](editor-legacy-regression.json) and [download inspection](export-validation.json)
also remain available; the final regression exercises the build after getter pruning.

## Isolated authenticated and real-model flow

The exact SDK 3.8.20 was copied from the stopped official release container
`ghcr.io/lingxi-org/lingxiloop-server:2b49a1cc42fbe8f99e443641`, digest
`sha256:0101f13f7a0fbf74107fb9ce3e1d0c56417c30622cd4248b9e867a9e9623bed9`.
It is the published runtime, not a source clone or substitute package. The local
npm 401 did not require credential changes.

A fresh PostgreSQL/Redis test environment used localhost ports 15432/16379 and
the dedicated `issue_601_test` database. CI run
[41173534821](https://github.com/LingXi-Org/LingxiLoop/actions/runs/41173534821)
exported its formally bootstrapped **empty** database before tests. The export
script checks that user, participant, message, ledger and native-work tables are
empty, preserves SDK receipts/checksums, and allows only the CI test database.
The 3-day CI artifact can be reproduced by rerunning that workflow. PostgreSQL
17 decoded its archive; only the PG17 session setting `transaction_timeout=0`
was omitted when importing into the isolated PG16 instance. No schema, data,
migration checksum or installation receipt was rewritten. Product 61/schema14
assertions passed after restore; production data was never accessed.
[Bootstrap provenance](isolated-bootstrap-provenance.json) records the exact
installation and 61 migration checksums.

`scripts/test-slides-live.ts` requires explicit `LINGXIOS_LIVE_PROTOCOL=1`,
`NODE_ENV=test` and those exact local DB/Redis endpoints before loading product
infrastructure or resetting test data. It uses the real control-plane Worker in
Miniflare/D1, Better Auth password sign-in, a session cookie, gateway assertions,
product HTTP APIs, the formal SDK worker and the configured metered model.
The user/account are isolated fixtures and Turnstile uses its documented test
key. WuKong remains a recording HTTP adapter and blobs remain in memory.

The [final live run at `99369639`](live-model-final.json), on 2026-10-31 at
06:21 UTC, completed the edit in 24.35 seconds (5 agent-turn ledger receipts,
1 embedding) and the comment round in 15.664 seconds (4 agent-turn receipts,
1 embedding). These model waiting times are excluded from editor performance.
Both answers were delivered and replayable.

The model edits a selected title, reads it back and preserves body/notes, then
receives a real editor comment through the native event worker, reads the saved
page/comment and replies/resolves it. The HTTP editor snapshot checks the agent
reply and unchanged file hash. The owning deterministic integration also tests
actual assignment delivery and legacy-room fallback. Its first run exposed the
old native worker source-room predicate; fixing it is required for both comments
and cooperation to work in the dedicated room.

Example invocation after restoring the formal empty fixture (use the configured
provider credentials in `.env.local`; never paste them into this document):

```sh
NODE_USE_ENV_PROXY=1 NODE_ENV=test DOTENV_CONFIG_PATH=/dev/null \
DATABASE_URL=postgresql://postgres:issue601-test-only@127.0.0.1:15432/issue_601_test \
INTEGRATION_DATABASE_URL=postgresql://postgres:issue601-test-only@127.0.0.1:15432/issue_601_test \
REDIS_URL=redis://127.0.0.1:16379 LINGXIOS_TEST_REDIS_URL=redis://127.0.0.1:16379 \
LINGXILOOP_GATEWAY_HMAC_SECRET=slides-601-isolated-gateway \
LINGXIOS_LIVE_PROTOCOL=1 AGENT_OS_MAX_MODEL_CALLS=12 AGENT_OS_MAX_WORK_MS=240000 \
node --env-file=.env.local --import tsx scripts/test-slides-live.ts
```

These local fixture credentials are not production secrets. This check resets
only the explicit isolated test DB and makes metered model calls. It does not
validate real WuKong restart durability, production object storage, responsive
browser sign-in, or production deployment.

## Checks and remaining gates

- Source build, translation, archive integrity and compiler parity: 5/5.
- Split/presentation surface checks: 2/2.
- Migration/deployment-plan and packaging owning checks: 40/40 locally.
- Local web/server lint passed; web retains existing warnings.
- Code-candidate CI [41175839535](https://github.com/LingXi-Org/LingxiLoop/actions/runs/41175839535)
  at `99369639` passed Web, Server, 22 selected integration files and deploy-contract.
  The four Slides flow cases all passed. Subsequent evidence-only commits have
  their own check result linked in the PR; deployment remains skipped.
- Local web/server typechecks and the four dedicated-room integration cases pass
  with the official published runtime. The deterministic provider fixture checks
  five chat ledger receipts; optional memory embeddings have separate receipts.
- Chromium retention regression verifies one mounted workspace, permission check
  before visibility, access-revocation cleanup and deck/project-switch cleanup.
- Remaining acceptance: cold/fresh-frame performance, the untested matrix
  variants, actual IM restart/history durability and production acceptance.
  There is no remaining local npm/SDK authentication blocker. No separate review
  tree was created, as instructed by the parent coordinator.
