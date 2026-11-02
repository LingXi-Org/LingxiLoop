# GenUI resource preparation

Baseline: `0d231b60`. Measurement uses the existing #611 real GenUiCard/SDK
fixture and the generated production runtime, with only the page/state API
replaced by deterministic local responses. It excludes whole-app startup,
production authorization/database latency and the reporter's actual document.

The host previously downloaded and awaited `math.js` for every view. This is
639,387 decoded bytes / 344,124 gzip bytes competing with the mandatory
282,127-byte `gen-ui.js`, even when a view has no formulas. All initial reads
share the existing 15-second initialization budget. The new document test
failed on this extra request before implementation.

The pinned kit now skips this request when the authored fragment contains no
math delimiters. Initial formulas still await the same optional renderer;
older hosts retain the old loading path. The existing optional script loader
detects later formula text, fetching the fixed hash URL with SRI and anonymous
CORS. Text scans exclude script/code/style and the renderer's other ignored
containers. The real browser regression caught the first detector reading its
own script source; the final detector walks eligible text nodes instead.
The initial SDK, page capability, integrity validation, total deadline,
authorized recovery, revocation and cancellation rules are unchanged.

## Paired results

Ten alternating AB/BA pairs per scenario, 40 observations. Chromium
148.0.7778.96 on Windows 11, 1440×1000, 20 ms latency, 4 Mbps download,
3 Mbps upload, CPU 1×. The same network profile applies to the page and OOPIFs.
No other build or browser benchmark ran during this paired run. Values are
nearest-rank p50 / p75 / p95 milliseconds; with ten samples p95 is the maximum.

| Click to accepted SDK state change | Baseline | Candidate |
| --- | --- | --- |
| Cold view | 1,447 / 1,466 / 1,548 | 616 / 642 / 644 |
| Retained reopen | 201 / 204 / 215 | 164 / 170 / 185 |

Cold p75 fell **56.2%**. The cold resource requests fell 4 → 3, decoded
renderer bytes 948,124 → 308,737 and encoded response bodies 426,393 → 82,269.
The payload counter has a direct cause here: the same real view becomes usable
without downloading or evaluating a renderer it does not use. Reopen already
reuses its iframe; no new transfer optimization is claimed for reopen.
Raw samples and Resource Timing entries are in `evidence/genui-paired.json`.

## Guards and limits

- All 12 focused document, resource recovery and real-host cancellation tests
  passed; the new regression locks out the unused initial math request.
- Chromium accepted real widget state changes in both builds, with exact pixel
  equality at 1440px and 390px (`genui-{baseline,candidate}-{width}.png`).
- When both math routes deliberately stall, the no-formula view makes zero math
  requests and acknowledges a real click in 436 ms (unthrottled smoke).
- Later inline and display formulas render from one hash-bound script request;
  initial formulas still render, and prices/code remain literal. See
  `evidence/genui-regressions.json`.
- Scoped Biome lint passed. Both production fixture builds passed; only existing
  CSS pseudo-element, third-party annotation and bundle-size warnings remain.

A read-only production diagnostic returned the pinned `gen-ui.js` with HTTP 200
(282,127 bytes; TTFB 1.154 s, total 2.447 s). That single request is not a
production percentile or a reproduction of the reported timeout. This removes
a confirmed contributor; the specific production timeout still needs the final
deployed app/network acceptance. Math-heavy views retain their renderer cost.
No production data, settings, deployment, CSP wildcard or timeout was changed.

## Reproduce

Build `perf/issue-611/index.html` against baseline and candidate source roots:
`node perf/issue-611/build.mjs <source-root> <output-directory>`.
Generate the runtime with `npm run build:visualize-runtime` as usual, then start
two separate processes, using the corresponding fixture output directories:

```sh
node --import tsx perf/issue-626/genui-serve.ts . .codex-tmp/genui-baseline 4197
node --import tsx perf/issue-626/genui-serve.ts . .codex-tmp/genui-candidate 4198
python perf/issue-626/genui-regression.py
python perf/issue-626/genui-bench.py
node --import tsx --experimental-test-module-mocks --test --test-force-exit --test-concurrency=1 src/features/chat/visualize/web/document.test.ts src/features/chat/visualize/web/resource.test.ts src/features/chat/visualize/web/host-resources.test.ts
```

The narrow fixture uses Node HTTP/gzip because this machine's pre-existing
dependency installation lacks the declared `compression` package needed by
the full #611 server. Both measurement arms use the identical server and bytes.
