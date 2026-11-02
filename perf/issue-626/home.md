# Full web startup

## Reproducible baseline

Baseline `0d231b60` was rebuilt from the separate, clean detached checkout
`E:/lyyzka/LingxiLoop-perf-baseline-20261102`. Candidate production source is
`ec81952e` (later `cf7f4068` changes only an integration fixture). Earlier
intermediate builds/observations are excluded from the final comparison because
their build/edit ordering was not independently established.

Both builds use the same existing locked dependency installation and the same
generated visualization assets; those asset generator inputs did not change.
The first isolated baseline build stopped because these ignored generated
assets were absent. Linking the unchanged generated runtime and rerunning the
build succeeded. Candidate typecheck and build also succeeded.

The local `serve.mjs` serves the actual Vite output with identical gzip/cache
headers, a synthetic authenticated learner, empty course/conversation data,
and a fixed 100 ms API response delay. Unknown APIs return a visible 503;
there is no realtime/write backend. This isolates application bootstrap and
does not substitute for production login, real IM traffic or a class-sized
course. In particular, the empty course does not measure the additional server
savings from removing per-assignment private history scans.

## Measurement and guards

| View | Baseline p50 / p75 / p95 (ms) | Candidate p50 / p75 / p95 (ms) | Initial JS bytes |
| --- | --- | --- | --- |
| Conversation homepage | 4,916 / 4,958 / 4,966 | 3,243 / 3,253 / 3,288 | 1,455,932 → 606,792 |
| Learner course overview | 5,408 / 5,450 / 5,483 | 3,210 / 3,221 / 3,226 | 1,644,333 → 713,030 |

P75 falls **34.4%** and **40.9%**, respectively; the 50% time target is not met.
Initial JS transfer falls **58.3%** and **56.6%**. Percentiles use nearest-rank
selection; with ten samples p95 is the maximum. Forty samples completed with
zero page errors and both relative timing/byte ratchets passed.

`home-bench.py` alternates AB/BA for ten cold contexts per arm and view, forty
observations total. Chrome 156, 1440×1000, 20 ms latency, 4 Mbps download,
3 Mbps upload, CPU 1×. No concurrent build or browser benchmark runs.

Conversation usability ends after a real click opens the new-conversation
dialog. Course usability requires the actual overview and its focused forum
action, followed by a real click and assertion that the app navigated. The
original navigation's timing is retained before starting the destination load.
Raw same-origin Resource Timing, main-thread long tasks and page errors are
retained in `evidence/home-paired.json`; third-party security-software injection
is excluded from byte counts. Machine security settings were not changed.

The relative ratchet requires both p75 values below 85% and JS bytes below 70%
of their paired baseline. The graph assertion independently prevents an empty
conversation from eagerly importing `ConversationThread`; it failed before
that change and passed afterward. Mermaid browser regression renders the real
diagram and validates delayed loading, configuration and error behavior.

`home-visual.py` compares settled 1440px and 390px views with reduced motion,
after fonts load. It checks no page errors or document horizontal overflow and
allows at most 0.5% pixels above a 16-level color difference. It covers the
empty conversation and learner overview layouts. Screenshots and comparison
results are stored alongside the raw timing data. All four comparisons passed
with zero pixels exceeding that color threshold; both widths had no overflow
or page errors.

## Reproduce

Build each source checkout with:

```sh
node node_modules/vite/bin/vite.js build --manifest --outDir <absolute-output-dir>
```

Serve both outputs from the candidate checkout in separate processes:

```sh
node perf/issue-626/serve.mjs .codex-tmp/perf/baseline-exact 4202
node perf/issue-626/serve.mjs .codex-tmp/perf/candidate-final 4201
python perf/issue-626/home-bench.py --urls http://127.0.0.1:4202 http://127.0.0.1:4201 --runs 10 --out perf/issue-626/evidence/home-paired.json
python perf/issue-626/home-visual.py
node perf/issue-626/startup-graph.mjs
node perf/issue-626/mermaid-browser.mjs
```

Python checks use the existing Playwright and Pillow installation; no project
dependency or lockfile was changed. This does not measure live message send,
real input-method behavior, post-release traffic or Firefox/Safari.
