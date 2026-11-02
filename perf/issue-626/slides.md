# Slides loading, issue #626

Baseline: `0d231b60`. Measurements taken on Windows 11, Chrome 156, on
2026-11-02. Source changes were frozen at 07:48:49 UTC before the final paired run.

## Removed critical-path dependencies

Previously `SlidesWorkspace` waited for its workspace/IM request, then the entire
conversation list and participant directory, before even mounting the editor.
Only then could the independently authorized editor-grant request and iframe
navigation start. The workspace module also imported the chat UI synchronously.

The editor now starts its own grant immediately. Assistant code loads in its own
Suspense boundary while workspace setup runs; the assistant runtime starts only
after the authorized conversation list is refreshed. Participant metadata refresh
continues independently. An assistant failure/retry retains the live editor and
does not abort an editor-context save. Sending still waits for those saves.

The Slides library defers the workspace module until a deck is opened. Existing
single-workspace retention, reauthorization before showing a retained deck,
revocation cleanup and project/account boundaries remain intact. App's existing
user/company/authorization key and DesktopApp's project key still remount the
workspace on scope changes.

## Paired host measurement

[`slides-loading.mjs`](slides-loading.mjs) builds the real host/frame lifecycle
from baseline and candidate, then alternates A/B ten times in the same browser.
The editor child is a minimal functional fixture with the actual source/nonce/
schema handshake; this does **not** measure the full editor's parsing/rendering.
The fixed delays are workspace 300 ms, conversation reload 400 ms, participant
directory 500 ms, and child HTTP response 50 ms. Bundle loading is excluded.

| Metric | Before p50 / p75 / p95 (ms) | After p50 / p75 / p95 (ms) |
| --- | --- | --- |
| Render request to editor handshake | 898.2 / 908.2 / 961.8 | 88.9 / 93.8 / 111.4 |
| Render request to assistant control | 812.2 / 817.2 / 852.6 | 715.6 / 716.6 / 725.8 |
| Render request to editor-grant start | 809.0 / 811.6 / 843.6 | 2.4 / 2.8 / 13.1 |

All twenty samples requested exactly one editor grant. The performance assertion
requires candidate editor-handshake p75 below 60% of baseline and no extra grant.
The causal result is removal of the two earlier dependency stages, not a claim
that a production PPT opens in 94 ms. Full samples and browser identity:
[`evidence/slides-host-paired.json`](evidence/slides-host-paired.json).

```powershell
$env:CHROME_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
node perf/issue-626/slides-loading.mjs
node perf/issue-626/slides-loading.mjs --baseline=0d231b60
```

## Actual editor observation and remaining cost

The existing real-editor benchmark ran ten cold and ten fresh-iframe reopen
samples with 20 slides, notes, and a shared SVG image. The opaque iframe retained
its sandbox; both parent and child used 20 ms latency / 4 Mbps down / 3 Mbps up.
The checkpoint verifies a visible loaded image and a real double-click entering
text editing. Browser errors: none.

| Current editor | p50 / p75 / p95 (ms) |
| --- | --- |
| Cold to editable | 3358.6 / 3435.5 / 3495.2 |
| Fresh iframe reopen to editable | 3437.1 / 3540.6 / 3619.1 |

The first sample's largest JS resource is 689,049 Brotli bytes and finishes at
2364.2 ms; the 60,180-byte fallback font finishes at 3003.0 ms. This remains a
substantial transfer/rendering cost. These current-only observations are not a
paired before/after speedup, do not include authentication/workspace/IM waiting,
and are not evidence of subsecond production opening. The benchmark's aggregate
CDP transfer counter is not used to infer a lower bound; individual resource
timings are retained in [`evidence/slides-editor-current.json`](evidence/slides-editor-current.json).

```powershell
node scripts/slides-workspace-benchmark.mjs --chrome="C:/Program Files/Google/Chrome/Application/chrome.exe" --runs=10 --compression=precompressed --out=perf/issue-626/evidence/slides-editor-current.json
```

## Build correction

The esbuild private-runtime pruning filter matched `/` only. Windows builds
reported 4,373 removed bindings but did not apply their rewritten module source.
The filter now accepts both separators. A regression checks the emitted entry
does not retain an unused private getter, rather than trusting the report count.

| Windows build metric | Before | After |
| --- | ---: | ---: |
| Initial JS, uncompressed bytes | 3,610,315 | 3,446,035 |
| Initial JS, gzip bytes | 1,175,621 | 1,122,881 |
| Main JS, Brotli bytes | 727,435 | 689,049 |

Linux already matched the filter; this is a Windows build fix, not a claimed
production bundle reduction. Generated editor files remain ignored and are
rebuilt through the existing script. No vendored runtime, sandbox, grants,
serialization, compiler exports, or editing capabilities were removed.

## Regression record

Before implementation the deferred workspace test timed out because no editor
iframe mounted. The optional-directory case then timed out after channel reload
until the directory response was released. The lazy-boundary regression failed
with `workspace eagerly loaded assistant code`; its stronger initial-null case
also reproduced late Suspense initialization. All now pass. The emitted private
getter assertion failed against the original Windows build, then passed after
the path fix.

Completed checks:

- `node --test scripts/slides-editor.test.mjs`: 9 passing, including rebuild,
  translation, unchanged archive hashes, compiler/serialization compatibility,
  lazy exports, compression, and existing style behavior.
- `node --import tsx --experimental-test-module-mocks --test --test-force-exit src/features/slides/artifact-surface.test.tsx`: 2 passing.
- `node perf/issue-626/slides-loading.mjs`: passing; editor readiness with pending
  workspace/code, independent roster, source action, context-before-send and
  editor preservation through assistant failure/retry. Result:
  [`evidence/slides-lifecycle.json`](evidence/slides-lifecycle.json).
- `node scripts/check-slides-retention.mjs`: passing; library lazy boundary,
  retained frame, authorization/revocation and project cleanup.
- `node scripts/check-slides-editor-visibility.mjs`: passing; wrong source,
  nonce and schema rejected, valid application handshake before iframe load,
  opaque sandbox, timeout and fresh-grant retry.
- Scoped Biome lint on all four changed Slides components: passing.

Two existing fixtures needed narrow environment corrections. The visibility
fixture previously stalled the opaque iframe's OPTIONS preflight as if it were
the deferred GET, so it now returns 204 for OPTIONS. The retention fixture now
uses the real `writeWebDestination` to clear the old deck query when changing
projects. Neither fix changes production security checks or browser flags.

Live production latency, actual class-sized IM setup, authenticated API/ACL
integration and production deployment were not exercised by this work.
`openSlideWorkspace` still performs current permission synchronization before
enabling the assistant; those checks were not bypassed or altered.
