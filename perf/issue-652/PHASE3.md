# #652: native draft recovery, progressive first edit and release-safe resources

Continues draft [PR #658](https://github.com/LingXi-Org/LingxiLoop/pull/658).
Product source is `68686983` (core implementation `185d8213`; the final change
only makes the progressive/unsaved notice visible above the canvas). The
subsequent deployment-only guard is `b5f7176f`, whose owning 32-test contract
suite passes; a missing source-image regression failed before that guard.
This **does not complete #652**. The original cold goals remain Design
p75 ≤2786.25 ms and Slides ≤1761.6 ms. The retained goal remains ≤300 ms.
[Phase 2](PHASE2.md) is historical evidence and has not been rewritten.
[Source/build hashes](evidence/phase3/provenance.json) and
[check scope](evidence/phase3/checks.json) identify each qualified commit.

## Implemented changes

### Native unconfirmed-draft recovery

Before replacing an initialized frame because its original grant expired or
its write mode changed, the parent asks that native document for a snapshot.
It first commits the focused native text edit, then serializes the actual
model with its title and SHA-256 of the last confirmed state. A scoped parent
Blob holds at most 16 MiB per retained frame. It is a **current-tab memory copy**,
not persistent crash recovery. The UI explains that the user must download it
before closing/refreshing; a pending copy also installs a beforeunload warning.
No indefinite grant renewal, background draft eviction, schema or DB write was
added.

If snapshotting fails, the bridge is absent, the snapshot is too large, or an
earlier backup is unresolved, the old frame stays concealed. Destruction
requires an explicit discard dialog. The backup is not sent automatically to
the fresh frame. “恢复并重新打开” requires fresh read/write authorization, a clean
native document, the same confirmed base and a parser that preserves every
field. Native save/CAS/conflict behavior then owns persistence. A confirmed
exact save releases the backup; normalization differences preserve it for
comparison. A further snapshot protects edits made before the subsequent
fresh-grant reload. Read-only/changed/incompatible states allow a freshly
authorized download, without overwriting the server. Read denial and scope
teardown clear the iframe, Blob and outstanding download object URLs.

Parent IPC checks the current WindowProxy, isolated origin, nonce, request id,
kind, response shape and bounds. Native restore checks the model/base again
after asynchronous hashing. Opaque legacy frames may return their own
snapshot; they do not receive private restore bytes through a wildcard target.

[Desktop recovery](evidence/phase3/recovery-desktop.json) and
[768px recovery](evidence/phase3/recovery-narrow.json) exercise actual Design
and Slides, with synthetic ACL/CAS: a failed save, grant expiry, capture before
replacement, explicit restore, confirmed save, refresh read-back; and write
downgrade, read-only download of the unsent native content, then read revocation
clearing both frame and copy. All eight cases pass without page errors.
These are not production ACL or forced-tab-close persistence tests.

### Progressive first-page editing

For an unrestricted, writable, supported deck without installed design systems
and with inline notes, the native files document exposes the parsed landing
slide as editable while other reads continue. It does not fake `loadState=live`.
The native document restricts updates to that already-read slide; title,
structure and asset-map changes are rejected. Toolbar/deck operations wait,
and the visible status explains that changes remain unsaved until loading
finishes. The existing loading boundary can show this real editor.

No partial envelope is decomposed or published. Once the complete file set is
known, the original native composition builds the full deck, then applies the
first-page edit using its original per-file base SHA through the existing
save queue. Unread slides cannot become deletions. If that page changed or
was deleted, or write permission changed while reading, the local model stays
in a blocked partial state with a specific copy-before-reopen message; neither
version is overwritten. A read-access revocation clears the partial content.

Other files are still requested in parallel; the remaining deck is activated
atomically after the complete read. This is an early editable landing page,
not per-page lazy loading for every format. Read-only/narrowed/design-system
cases retain the previous full-load path. The existing native conflict and
undo systems remain; no SDK adapter or new document format was introduced.

[Native browser evidence](evidence/phase3/progressive.json.gz) deliberately
delays later reads by eight seconds per request, without interception. The
first page accepts input before those responses, no partial publish occurs,
all other 19 page sources and full order survive, and the edit saves after
completion. Undo/redo after completion passes. A paint hit-test and screenshot
verify that the loading/unsaved notice is above the canvas. Native unit
regressions cover restricted reads, write downgrade, concurrent edits/deletion,
CAS and no premature writes. The regression first failed on the old behavior;
the permission and concurrency cases also failed before their corresponding
fixes.

### Templates and presentation

The template picker/data and restyling are registered and initialized only at
their consumers. Shared renderer messages remain a cheap core module at their
original i18n position. The cover-title sample check is an asynchronous data
consumer; after loading it rechecks disposal, read-only state and slide
revision. The native picker opens immediately with loading/error/retry UI,
and is unmounted when closed. Node keeps the original eager/synchronous data.

[Native template first use](evidence/phase3/templates.json.gz) proves no template
requests during first view, a real first-fetch 503, retry, Escape/reopen,
insertion, undo/redo, native save and one successful >1 KiB JS transfer per URL.

The heavy presentation and speaker panel move behind another fixed feature
boundary. Fullscreen request, editor animation helpers, speaker session state
and popup CSS remain available synchronously, so the original user gesture
can still open the popup or enter fullscreen. A stable thin React view owns
preparation/retry/exit; it shares, rather than resets, the original pending
fullscreen state. All lazy bindings register before initialization. The Node
compiler eagerly installs the original native view.

[Native presentation evidence](evidence/phase3/presentation.json.gz) checks no
first-view presentation request, first 503/retry retaining real fullscreen,
arrow navigation, Escape/fullscreen cleanup, cached reopen and speaker-popup
navigation. Existing math/HTML/PPTX/PDF checks pass. The small speaker-session
and synchronous popup styling remain eager. The browser still runs **291 core
initializers**, one fewer than Phase 2's 292; this is not a claim that all
remaining initializers are cheap or necessary.

### Cross-release public editor assets

`deploy/retain-editor-assets.mjs` prepares the union of the two observed
running server images and the target image on **both** app hosts before any
API/background-worker stop or runtime CAS. Existing stack selection pairs
app-a/app-b. Missing or unknown source-image references fail closed; an absent app container is not treated as proof that no old native version exists. Each host uses a
lock. An isolated, networkless, read-only, capability-free Node container
copies only fixed public JS/CSS/WOFF2 routes into the host cache; it receives
no runtime config, credentials, DB or user-data mounts. Only API containers
mount that cache, read-only. Existing private grant/project routes do not
fall back to it.

The 24-hour retention exceeds the 12-hour grant lifetime. Every observed
source and target graph, including never-used lazy chunks, is copied/touched
before final pruning. The steady cache cap is 2 GiB, with a bounded three-image
preparation allowance; each image is bounded at 128 MiB/2048 files and each
file at 16 MiB. It refuses excess space rather than evicting young resources.
Immutable decoded bytes, compressed sidecars, regular files and safe names
are checked; symbolic links/conflicting content fail. Recognized interrupted
public temporary copies are safely removed under the host lock.

[Actual old-release browser check](evidence/phase3/old-release.json.gz) starts
an old native Slides frame before its export graph is requested, replaces a
disposable live directory with the candidate, then successfully first-uses
the old HTML export through the retained public cache. Its iframe/document
stay the same, and old Design external runtime bytes also match. The local
cache preparation uses the real helper, not browser routing/interception.
Docker bind mounts, two production hosts and a full old Design subcanvas are
**not qualified by this local test**. No production operation was performed.

## Measurements

Every cell is nearest-rank p50 / p75 / p95 in ms, ten samples per arm.

| Editor / scenario | Baseline | Candidate |
| --- | ---: | ---: |
| design / cold | 5550.9 / 5568.6 / 5584.9 | 4670 / 4686.9 / 4739.1 |
| design / warm-new-frame | 1061.9 / 1079 / 1089.6 | 1067.1 / 1079.4 / 1290.6 |
| design / switch | 1204.6 / 1216.8 / 1224.2 | 1198.2 / 1212.1 / 1214.5 |
| slides / cold | 3511.9 / 3561.9 / 3573.8 | 3290.7 / 3320.5 / 3489.2 |
| slides / warm-new-frame | 836.6 / 878.8 / 918.4 | 789.1 / 804.2 / 808.5 |
| slides / switch | 918.6 / 928.6 / 953.9 | 867.5 / 923.2 / 937.2 |

**The original cold gate fails** (`--require-target` returns 1): Design p75 4686.9 ms and Slides 3320.5 ms exceed 2786.25 / 1761.6 ms. Retained passes; the staged ≤10% cold-regression guard also passes. Cold improves about 15.8% / 6.8% against the paired baseline, not 50%.

| Retained reopen | Design p50 / p75 / p95 | Slides p50 / p75 / p95 |
| --- | ---: | ---: |
| 1440px | 206.9 / 212.1 / 217.9 | 227.3 / 237.9 / 243.0 |
| 768px | 204.5 / 210.2 / 235.7 | 213.5 / 224.4 / 266.6 |

All 40 retained reopens preserve iframe/WindowProxy/document identity, request fresh authorization and transfer no new scripts. Eviction releases both frames; reopening gets a new native document.

Chromium family PSS: after repeated editing, both-hidden end is 561.04 / 553.19 MiB (desktop/narrow); Slides-visible end 559.13 / 556.05 MiB. Releasing frames leaves 555.43 / 554.21 MiB; explicit host GC after dropping test references yields 364.03 / 356.28 MiB. Hidden CPU over five seconds is 0.08 / 0.06 seconds, versus visible Slides 0.16 / 0.10, with the same process sets. These support a two-frame count bound, not a hard byte cap or immediate natural reclamation.

[All timings/network distributions](evidence/phase3/summary.json), [120 raw opens](evidence/phase3/paired-open.json.gz), [desktop retention](evidence/phase3/retained-desktop.json), [narrow retention](evidence/phase3/retained-narrow.json). Raw long-task entries describe the context containing the editable target (Design artboard guest), not complete parent/runtime initialization cost; that broader cost inventory remains a gate.

The Design entry alone is 1,528,126 Brotli bytes: its ideal transfer floor at 4,000,000 bits/s is about 3056 ms, already beyond the 2786.25 ms cold goal before other resources or initialization. Slides still has 3,649,022 decoded / 1,180,633 gzip eager JS bytes and 291 initializers. The remaining support/compiler/property/core graph must shrink; warming or retained reopens cannot meet these cold budgets.

Measurement source: `68686983`; baseline generated editors and parent fixture
were saved from `b7c9f54a`. Both arms use the same current deterministic server
fixture and installed dependencies. Production authorization, database, IM,
CDN/model time are excluded. Chromium 154.0.8037.57, Linux, HTTPS/Brotli,
1440×1000, CPU 1×, recursive 20 ms/4 Mbps CDP throttling, actual authored canvas
plus trusted double-click entering editing. Ten alternating paired trials per
kind/scenario produce 120 opens. Empty contexts define cold; cached new frames
and different-artifact switching are separate. Retention is a separate native
candidate run at 1440px and 768px, preserving iframe, WindowProxy and child
document time origin, reauthorizing and transferring no new scripts.

A 24-open preliminary run was interrupted for the notice visibility correction
and is excluded. No builds or other browser checks run alongside final timing.
Proportional set size sums the dedicated Chromium process family, not JS heap;
background CPU sums its user/system time over five seconds. Explicit host GC
is a separate diagnostic, not a natural-reclamation or hard memory-byte cap.

## Verification and release limits

- `185d8213`: editor/math/compiler/archive/flow/deploy suites 72/72, Web 151/151,
  recovery/static focused 10/10, both web TS configurations, Vite and fixture
  builds pass. Full Web lint exits zero with 46 existing warnings and two infos.
- `68686983`: owning Slides suite 22/22 and the actual progressive edit,
  preservation/save/undo/redo/visible-notice browser run pass. Its sole product
  difference is notice geometry. Exact final build/host hashes are recorded.
- Unchanged #657 at `2a945125` was run verbatim against the candidate: 25/25.
  The temporary test copy was removed; its PR remains separate and unchanged.
- Actual DesktopApp desktop/narrow ownership and library retention pass.
  Native recovery, template/presentation and first-use failures run through
  the real frame/gateway/CSP/HTTP cache with synthetic files/permissions.
  The routed math/export browser suite is separate; it is not cache-transfer
  evidence. A real embedded-font WOFF2 decoder failure remains unqualified.
- Local SDK is still 3.8.16 against the formal 3.8.21 dependency. The ordinary
  registry metadata read returned E401. No credentials, registry permissions
  or security configuration were changed. Existing final-head CI must verify
  the exact dependency; old Phase 2 CI does not qualify these source changes.

Remaining issue gates include comprehensive Design core/support/picker and
Slides property/core splitting; exact dependency/initialization inventory;
progressive formats outside the narrow safe path above; original cold goals;
full subcanvas/export/font and real ACL permutations; final independent review;
and the sole integrator's production verification. In Design, `Ej` still reads
`react18UmdSource`, `reactDom18UmdSource` and `dcSupportSource` synchronously into
the preview program; `Tz` consumes the 624740-byte injected program. They need
an explicit asynchronous preparation/readiness contract preserving the checked
guest protocol, not a promise substituted into a source string. Slides still
has eager support/compiler/editor/selection-inspector groups. The raw consumer
inventory includes broad property-name matches and is not a complete internal
call graph; its presence does not satisfy comprehensive analysis by itself.

This contributor has not merged, deployed, SSHed to production, changed
credentials or asserted that either host is ready. The parent thread's unique
integrator must reconcile the shared CLI with #654, confirm no in-flight
writers/rollout, and perform final independent review and the authorized
release. A green branch CI is not a successful production deployment.

## Reproduction

Use Node 22.23.4 and installed dependencies without modifying credentials.
Build `scripts/build-design-editor.mjs`, `scripts/build-slides-editor.mjs
--metafile=<path>`, and `perf/editor-open/build.mjs`. Start
`perf/editor-open/serve.ts` with loopback TLS and its documented disposable
fixture switches; never point the fixture at production. Then run:

```sh
node --test scripts/slides-editor.test.mjs scripts/artifact-math.test.mjs scripts/design-editor.test.mjs scripts/design-flow-size.test.mjs scripts/production-rag-contract.test.mjs
node --import tsx --test server/src/modules/artifacts/editor-static.test.ts src/features/artifacts/components/artifact-recovery-handoff.test.ts
python3 perf/issue-652/recovery.py 4414 <output> [768]
python3 perf/issue-652/progressive.py 4418 <output>
python3 perf/issue-652/templates.py 4416 <output>
python3 perf/issue-652/presentation.py 4416 <output>
python3 perf/issue-652/first-use.py 4413 <output.json.gz>
python3 perf/issue-652/release-assets.py 4415 <disposable-live-dir> <output.json.gz>
python3 perf/issue-652/bench.py 10 <output.json.gz> baseline=4411 candidate=4412
python3 perf/issue-652/retained.py 4412 <output.json> [768]
node perf/issue-652/assess.mjs <paired.json.gz> --retained=<retained.json> --require-target
```
