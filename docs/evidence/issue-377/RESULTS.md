# Saved visualization loading: measured scope and remaining gate

The bounded change reuses completed fixed public bytes across new authorized pages.
It does not change the runtime, authored HTML, source admission, final fresh state
GET, retained identity, SDK state ACK, full host-context notifications or tweak
receipts. No generation, model, save-to-delivery or production timing was measured.
#259 stays `not_planned`; this work only partially addresses #377.

## Exact comparison

Baseline host: `0d1271a0cf92b22e01b456c7473f4e446027bd28`, injected from Git
without rewriting the file. Candidate source: `7e713ab4c94facb6c83d779792f6030cdd1aea73`.
The same Chromium153/Linux,1280x900/DPR1, fixture SVG/guest SDK and public asset hashes
were used. Cold samples navigated to a new document. Synthetic latency was either
0ms or300ms on each resource and fresh state GET. These tiny samples are not
production percentiles. Budgets were frozen before connecting the cache.

| Scenario | Before paint / ready ms | After paint / ready ms | Asset GET / transferred bytes before→after |
| --- | --- | --- | --- |
| Normal static cold, two samples | 657.7/718.6;530.9/546.3 | 607.6/624.0;553.7/564.2 | 6/1,180,581 each→same |
| Normal interactive cold, two samples | 489.2/545.5;620.0/645.1 | 467.3/509.6;535.1/545.0 | 6/1,180,581 each→same |
| 300ms static cold, two samples | 1553.6/1568.0;1749.6/1762.0 | 1360.6/1372.7;1359.3/1368.3 | 6/1,180,581 each→same |
| 300ms interactive cold, two samples | 1515.7/1535.7;1398.3/1416.7 | 1405.6/1417.3;1361.0/1373.3 | 6/1,180,581 each→same |
| Warm new page,300ms | 1210.5/1192.8 | 656.4/668.7 | 6/1,180,581→0/0 |
| Retained return | 58.1/14.6 | 55.4/16.1 | 0/0→0/0 |
| First of three cold cards, original full runs | 1828.3/2055.8 | **6130.1/8355.3 (failed)** | 18/3,541,743→same |

Warm new-page paint decreased45.8% and ready44.0% in the recorded pair. It still
performed one page POST and one fresh state GET, using distinct HTML/capability.
Retained return kept the same inner frame and saved count, with no initialization
or resource read. Eleven initial after samples met their budgets, but the full
12-scenario after run **failed** on the final three-card case: from-open usable
control12,847.1ms, actual click→ACK/render3,226.7ms. No full-suite PASS is claimed.
Raw failure: `after-first-failure/timings.json` and `report.json`.

## One permitted narrow diagnostic

After stopping typechecks/tests, the root authorized one matched cold three-card
baseline→candidate pair; no budget or product-source change. Each side ran once
with the same source, viewport, delay and input. The diagnostic adds long-task
observations; the original full run did not record them. Both raw reports remain.

| Cold first-of-three | Paint | Ready | From-open usable control | Actual operation |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 2174.6ms | 2223.0ms | 2390.5ms | 18.3ms |
| Candidate | 1972.0ms | 2169.8ms | 2311.0ms | 20.2ms |

Candidate satisfied the unchanged2400/2600/2800/100ms limits in this diagnostic.
Both sides made18 asset GETs: pending capability-bearing reads are deliberately
independent. Baseline recorded one110ms parent long task; candidate recorded none.
This pair did not reproduce a candidate-specific regression, but does not explain
or erase the original failure. Server request timing in that original failure
showed several imposed300ms waits taking~635–714ms and fresh-state handlers
434–538ms; no cause is assigned. Resource snapshots retain nonzero-RSS processes,
/tmp space, cgroup memory and unchanged OOM counter. No further resampling ran.

## Checks and scope limits

- Web and server typechecks passed after the cache connection.
- Eleven focused tests passed: real-host page/resource/state separation, public
  manifest allowlist, digest/version/integrity/failure/abort/LRU/concurrent-reader
  tests, plus #373 help, draft scope, full context, display mode and tweak receipts.
- Focused Biome lint:12 files passed. The owning fixture/config TypeScript check
  passed after the diagnostic recorder was made JSON-safe and ES2022-compatible. No browser was rerun for these equivalent serialization/search changes.
- Independent read-only review at `7e713ab4` found no P1/P2 in resource boundaries,
  concurrency/cancellation, fresh GET/revision, scope or unchanged SDK lifecycle.
  Performance acceptance remains qualified by the original full-suite failure.

Cache retention is bounded to16 entries/8MiB; an oversize successful resource is
returned without retention. Missing hashes or unavailable WebCrypto use the
existing authorized retry path. Failed, canceled or mismatched reads never enter
the cache. The server exposes only eight fixed public hashes; requests still
validate source authorization and fixed manifests normally. No HTML/state/capability,
error, pending request, arbitrary script or private response is cached.

Rollback is removal of the host cache wrapper and optional page response metadata;
the original resource reads remain available. No dependency, renderer asset,
provider configuration, permission or deployment change is included.

Remaining acceptance: stable full mixed-scenario performance result; current
creation→save→delivery timing; real production/device/network distribution. The
single paired synthetic improvement does not establish cold-start or end-to-end
production improvement. This is a draft PR with explicit incomplete performance
gates, not an issue-closing performance claim.
