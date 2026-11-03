# Design and Slides editor opening — issue 646

## What made opening slow

1. **No edge cache.** The shared, content-hashed editor assets were sent with
   `Cache-Control: private`. Production answered `CF-Cache-Status: BYPASS`, so
   every download came from the origin server (Design's 1.82 MB Brotli entry took
   about 11 s with a 2 s first byte from a London proxy on 2026-11-02).
2. **Slides never reused its cache.** The Slides editor ran in an opaque-origin
   sandbox. An opaque frame gets a one-off HTTP cache partition, so every open,
   including a second deck, downloaded the whole editor again.
3. **Nothing happened before the click.** Neither editor's code was fetched
   ahead of time, and every Design open made two serial API round trips (ensure
   the board, then issue the grant) before the editor document was requested.

## Changes

| Area | Change |
| --- | --- |
| Edge caching | The grant-free `/artifact-editor/{design,slides}-assets/` responses are `public, max-age=31536000, immutable`. Grant-scoped paths stay `private`. |
| Slides origin | Each Slides grant opens on its own `<grant-hash>-artifact` origin, as Design already did. The page loads its hashed assets from the shared public URL, which is same-site with every grant origin, so one download serves every later deck and reopen. The ingress, credential stripping, service-worker refusal and per-request access checks are unchanged; the main-site editor URL keeps its opaque CSP sandbox. |
| Compatible rollout | The grant response keeps Slides' main-site `url` and adds `isolatedUrl`. Pages served with the new ingress open `isolatedUrl`; older pages keep working while servers and Workers deploy in either order. The frame keeps its own origin only when the URL is not the application's origin. |
| Warm-up | `/artifact-editor/preload.json` lists each editor's blocking script, stylesheet, preloaded chunks and first-view fonts (not math fonts). A conversation warms Design and the Slides library warms Slides once the page is idle, except on Save-Data or 2G. Hover or focus on the Design button, a deck or a chat artifact card warms at high priority. |
| No double download | An editor opened while its warm-up is in flight waits for it (at most 15 s) instead of requesting the same bytes again. |
| Grants | Intent starts the artifact's grant (Design: only for an existing board, nothing is created) and preconnects its origin. The open reuses a grant issued in the last 10 minutes for the same person, company and artifact; a retry always asks for a new one. Every editor request still re-checks current access. |

## Measurements

Local fixture ([`serve.ts`](serve.ts)): the arm's own isolated-origin gateway,
page asset rewriting, asset responses, CSP script policy and the generated editor
bytes; synthetic grants and documents (one Design board, a 20-slide deck with an
image). The host page ([`fixture.tsx`](fixture.tsx)) mounts the arm's real
`ArtifactEditorFrame` and, for the candidate, its real warm-up. Baseline is
`origin/main` at `8a8db8b5`.

[`bench.py`](bench.py), Playwright's Chromium 148, Windows 11, 1440×1000,
DevTools throttling 4 Mbps down / 3 Mbps up / 20 ms with all frames in the
page's process, a fresh browser context per scenario, 6 alternating
trials per arm. *Shown* is the host's own readiness (its loading placeholder is
removed); *content* is when the board heading or the first slide's text is in a
frame's document. Bytes are the page target's encoded bytes from click to
1.5 s after content. Raw samples: [`evidence/paired-4mbps-20ms.json`](evidence/paired-4mbps-20ms.json).

| Open | Baseline shown p50 / p75 | Candidate shown p50 / p75 | Content p50 (base → cand) | Bytes p50 (base → cand) |
| --- | --- | --- | --- | --- |
| Design, after warm-up | 5,867 / 5,942 ms | **1,013 / 1,051 ms** | 6,567 → 1,672 ms | 2.66 MB → 0.25 MB |
| Slides, after warm-up | 3,647 / 3,727 ms | **1,059 / 1,104 ms** | 3,788 → 1,205 ms | 1.53 MB → 0.21 MB |
| Second deck, cold page | 3,320 / 3,333 ms | **721 / 747 ms** | 3,432 → 797 ms | 1.53 MB → 0.21 MB |
| Design, 4 s after load (warm-up in flight) | 5,878 / 5,944 ms | 4,158 / 4,189 ms | 6,595 → 4,831 ms | 2.66 MB → 2.50 MB |
| Slides, 4 s after load (warm-up in flight) | 3,624 / 3,744 ms | 1,994 / 2,036 ms | 3,789 → 2,122 ms | 1.54 MB → 1.08 MB |
| First Design, cold page | 5,903 / 5,979 ms | 5,860 / 5,919 ms | unchanged | unchanged |
| Second Design board, cold page | 649 / 707 ms | 633 / 644 ms | unchanged | unchanged |
| First deck, cold page | 3,543 / 3,613 ms | 3,600 / 3,739 ms | unchanged | unchanged |

All 96 opens completed; no page errors. The first open on an empty cache is
unchanged by design: it is the download itself, which the edge cache shortens in
production but this local fixture cannot show. A second Design board was already
cached before this change (its assets were on the shared origin).

An unthrottled single trial also showed the baseline's first deck taking
2,356 ms against 761 ms on the candidate's isolated origin.

## Regression checks

- `scripts/artifact-math.test.mjs`: formula exports resolve their KaTeX fonts
  against the public stylesheet origin; project fonts and blobs retain their
  grant paths. Final review caught and corrected this export regression after
  the paired measurements; those measurements were not rerun for this correction.
- `src/features/artifacts/editor-preload.test.ts`: one grant per person, company
  and artifact; a retry or failed grant is not reused; assets are fetched once,
  anonymously; an open during warm-up waits instead of downloading twice.
- `src/features/design/open-design.test.ts`: the grant starts before the panel
  mounts; hovering reads only, never creates a board; no grant for another scope.
- `server/src/modules/artifacts/slides-page.test.ts` and the updated
  `workers/web-static/src/index.test.mjs`: Slides pages use the shared public
  asset URL; Slides grant origins get `allow-same-origin` only through the
  ingress; other grants' paths, the SPA, `/api` and assets stay unreachable there.
- `server/src/__integration__/artifact-app-boundary.test.ts` (CI): `isolatedUrl`
  for both kinds, Slides' compatible `url`, public immutable asset caching and
  the preload list (no math fonts).
- `perf/issue-626/slides-loading.mjs`, `scripts/check-slides-retention.mjs` and
  `perf/issue-626/startup-graph.mjs` pass unchanged.

## Reproduce

```sh
node scripts/build-design-editor.mjs && node scripts/build-slides-editor.mjs
git archive 8a8db8b5 src shared server/src/modules/artifacts tailwind.config.ts postcss.config.js components.json third_party/baoyu-design/slides-source/builtin-style.json | tar -x -C .codex-tmp/editor-baseline
node perf/editor-open/build.mjs .codex-tmp/editor-baseline .codex-tmp/editor-host-baseline
node perf/editor-open/build.mjs . .codex-tmp/editor-host-candidate
node --import tsx perf/editor-open/serve.ts .codex-tmp/editor-baseline .codex-tmp/editor-host-baseline 4411
node --import tsx perf/editor-open/serve.ts . .codex-tmp/editor-host-candidate 4412
python perf/editor-open/bench.py 6 perf/editor-open/evidence/paired-4mbps-20ms.json baseline=4411 candidate=4412
```

Restart both servers before a run: grants are `g1`… and the bench names
`g1`–`g150` as secure origins. The fixture is plain HTTP; the bench treats those
origins as secure because the editors need a secure context and this machine's
antivirus blocks local test certificates. Playwright's Chromium is used because
the installed Chrome gets that antivirus's script injection.

## Not measured

Production traffic, Cloudflare edge hit rates, real IM/agents and authenticated
use. The edge cache takes effect only after deployment, per Cloudflare location.
The vendored baoyu-design v2.8.0 upgrade is a separate change.
