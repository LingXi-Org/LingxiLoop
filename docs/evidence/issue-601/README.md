# Slides workspace evidence (#601)

Delivery: [PR #602](https://github.com/LingXi-Org/LingxiLoop/pull/602).
The branch includes production main `5b42a266dbc3f9cec205c8cd5fa3854c24bbce37`
(published SDK 3.8.20, native schema 14, product schema 60), and adds product
migration 61. This document records pre-release qualification. The production
rollout and post-migration observations are recorded separately in PR #602 and
its deployment run; these isolated measurements do not prove production acceptance.

**The original cold/fresh-iframe performance thresholds are not met.** The user
explicitly accepted the final measured performance for merge and production
release on 2026-10-31 at 06:43 UTC and requested no further optimization rounds.
Cold P95 is 2,872.4 ms; fresh-frame reopen is 2,587.2 ms. Retained-frame reopen
is separately measured at 182.7 ms against an authorization HTTP fixture. Real isolated credential login, model editing,
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
The [release generated manifest](editor-release-build-manifest.json) lists every input/output hash. Exports, PPTX and WOFF2
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
fix forward without removing durable data. The read-only
[pre-migration production observation](production-before.json) confirms runtime20,
native14/product60, two artifacts/four files, 60 conversations and 978 native
work items. Post-release inventory comparison belongs to the production record.

## Real browser measurements — final round

Application commit `ffb1d53c` (release-observation commit `8a34a64d`) is the final
performance candidate. Raw 10-run results: [immediately preceding build](editor-release-baseline.json),
[release candidate](editor-release-performance.json), [separate retained-frame group](editor-release-retained.json).
Earlier [original upstream-layout baseline](editor-baseline-repeat.json) and
[getter-pruned candidate](editor-final-performance.json) remain historical evidence.
Runs were sequential without concurrent local builds/tests. No prewarming or
threshold change was used; no further performance optimization is planned in this release.

Chromium 154, Linux, AMD EPYC 9V74 (5 logical CPUs), 1440×1000 at scale 1,
no CPU throttling; 20 ms latency, 4 Mbps down, 3 Mbps up. Both parent and
out-of-process iframe sessions are throttled. The opaque sandbox has no
`allow-same-origin`. The fixed deck has 20 pages, each with text, notes and the
same 640×360 SVG image; hashes are recorded. These are not 20 distinct photos.
The baseline uses gzip; the candidate uses its actual build-time Brotli-11 JS/CSS
representations. Changing the transmitted encoding is the implementation being
measured; bandwidth, sample and editable-readiness conditions remain identical.

Cold creates a fresh browser context. Fresh reopen navigates the host and mounts
a new iframe in the same context. Timing begins at iframe navigation and ends
only after a loaded visible image and a real double-click enters text editing.
Authentication, workspace API/chat startup and model waiting are excluded.
Editing measures trusted `beforeinput` through two animation frames and verifies
changed text. Most assets transfer again on opaque-frame fresh reopen.

| Metric | Before this round P50 / P75 / P95 | Final candidate P50 / P75 / P95 | Original target |
| --- | --- | --- | --- |
| Cold to editable (ms) | 3,353.9 / 3,445.8 / 3,490.4 | 2,774.4 / 2,798.7 / 2,872.4 | P95 ≤2,000: FAIL, accepted exception |
| Fresh-frame reopen (ms) | 3,066.7 / 3,076.1 / 3,082.8 | 2,513.0 / 2,561.3 / 2,587.2 | P95 ≤1,000: FAIL, accepted exception |
| Text edit feedback P95 (ms) | 50.9 | 55.0 | ≤100: PASS (fixture) |
| Cold JS execution P95 (ms) | 561.7 | 492.7 | Diagnostic |
| Cold JS heap P95 (MiB) | 17.78 | 17.97 | Diagnostic |

The final retained-frame group is P50/P75/P95 **169.9 / 176.0 / 182.7 ms**.
The host hides the same frame, then starts timing before a throttled authorization
HTTP fixture, reveals it and verifies actual editing. Actual product authorization
cost remains excluded. The earlier 204.7 ms group had the same limitation.
[React lifecycle regression](workspace-retention.json) separately checks reuse,
permission recheck before visibility, revocation and deck/project cleanup.
This is not a claim that full authenticated production reopen is ≤1 second.
The retained group inserts another step; its cold/edit numbers are supplemental
and are not substituted into the two-phase main comparison.

### Critical path and quantitative limit

The [before profile](editor-critical-path-before.json) and [after profile](editor-release-trace.json)
are separate one-run diagnostics, excluded from P95. Cumulative milestones:

| Milestone from iframe navigation | Before (ms) | Final (ms) |
| --- | --- | --- |
| Largest JS response finished | 2,614.3 | 2,002.1 |
| Application runtime starts / finishes | 2,661.0 / 2,780.3 | 2,042.0 / 2,158.5 |
| Write-access / files-port ready | 2,787.2 / 2,787.8 | 2,164.0 / 2,164.3 |
| React render requested | 2,792.7 | 2,168.6 |
| Early first-slide paint | 3,073.4 | 2,475.3 |
| Complete document ready | 3,243.0 | 2,645.6 |
| Visible loaded image / verified text editing | 3,259.0 / 3,432.9 | 2,658.3 / 2,830.7 |

The largest resource shrank from **869,518 gzip bytes to 688,890 Brotli bytes**;
shared support from 241,242 to 200,495; the helper chunk from 11,431 to 9,995.
CSS changed from 119,928 gzip bytes to 44,719 Brotli bytes after extracting the
complete 60,180-byte fallback font unchanged. That font is actually used in this
sample and fetched later (2,250.9–2,500.5 ms in the final profile); it is not
claimed as removed or never loaded. Hash-named CSS/font assets and precompressed
sidecars retain identity/gzip fallback, `Vary`, content type and HEAD semantics.
All editor/initializers/export capabilities remain present.

Initial JS + CSS total **944,250 encoded bytes**. With the needed fallback font,
these assets alone total **1,004,430 bytes**, a **2.009-second** throughput lower
bound at 4 Mbps, before document requests, latency and CPU. The final profile
spends 116.5 ms in runtime setup; render request to the visible-image checkpoint
is 489.7 ms. These stages overlap with file/font transfer and must not be added
as independent CPU times. V8 `ParseProgram` complete-event durations total
58.767 ms and `ParseFunction` 97.781 ms in that one trace; names may nest and
streaming spans include network waits. Browser decompression CPU and isolated
all-script parse wall time are **unmeasured**, not inferred from Node compression.

Byte-accounting audit: older `transferredBytes` counters summed all CDP
`loadingFinished` events, including inline `data:` font/image decoding. Those
raw historical counters are **not exact HTTP wire totals** and must not be used
for throughput lower bounds. The harness now filters HTTP(S) request IDs and
records excluded encoded bytes separately. [Before audit](editor-network-before.json)
and [after audit](editor-network-after.json), on the same builds, report
**1,260,050 → 1,022,565 HTTP bytes**. The 10-run timing results are unchanged by
this diagnostic counter correction. No timing samples are replaced by audit runs.

Full authenticated product/production P95 remains unmeasured. Nearest-rank P95
with ten observations is the maximum, not a confidence bound. The user accepted
these remaining performance gaps for this release, without redefining the targets.

```sh
node scripts/slides-workspace-benchmark.mjs --runs=10 --compression=precompressed --label=release --out=/tmp/slides-release.json
node scripts/slides-workspace-benchmark.mjs --runs=10 --compression=precompressed --retained=true --out=/tmp/slides-retained.json
node scripts/slides-workspace-benchmark.mjs --runs=1 --compression=precompressed --trace=true --out=/tmp/slides-profile.json
node scripts/slides-workspace-benchmark.mjs --runs=1 --compression=precompressed --regression=true --legacy=true --exports-dir=/tmp/slides-exports --out=/tmp/slides-legacy.json
```

For this round's baseline, build commit `756d5f3f` separately and pass its output
with `--editor=/path/to/assets-root`, omitting `--compression=precompressed`.
Use the same harness/browser and sample. `--chrome` overrides the Chromium path.

The [release legacy regression](editor-release-regression.json) verifies save,
undo/redo, saved reopen, presentation exit and absence of video controls/requests.
[Downloaded-file inspection](export-release-validation.json) verifies a real
20-page PDF, HTML with 20 slides/no video, and a valid PPTX ZIP with 20 slide XML
files/no video payload or relationships. Transfer counts in that regression
include exports/reload and are excluded from performance results. Older regression
and inspection JSON files remain historical evidence.

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

- Source build, translation, archive integrity, full-font/sidecar integrity and compiler parity: 5/5.
- Precompressed asset negotiation, q-values, HEAD, identity and no double compression: 1/1.
- Final browser legacy exports/save/undo/redo/presentation regression passed.
- Split/presentation surface checks: 2/2.
- Migration/deployment-plan and packaging owning checks: 40/40 locally.
- Local web/server lint passed; web retains existing warnings.
- Code-candidate CI [41175839535](https://github.com/LingXi-Org/LingxiLoop/actions/runs/41175839535)
  at `99369639` passed Web, Server, 22 selected integration files and deploy-contract.
  The four Slides flow cases all passed. Subsequent evidence-only commits have
  their own check and deployment results linked in the PR.
- Local web/server typechecks and the four dedicated-room integration cases pass
  with the official published runtime. The deterministic provider fixture checks
  five chat ledger receipts; optional memory embeddings have separate receipts.
- Chromium retention regression verifies one mounted workspace, permission check
  before visibility, access-revocation cleanup and deck/project-switch cleanup.
- The final cold/fresh-frame performance gap is explicitly accepted for release;
  original targets remain failed. Untested matrix variants, actual IM restart/history
  durability and full authenticated production P95 remain unverified.
  There is no remaining local npm/SDK authentication blocker. No separate review
  tree was created, as instructed by the parent coordinator.
