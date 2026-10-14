# Native streaming verification — 2026-10-14

The production renderer now lets `StreamdownTextPrimitive` own smoothing, animation and its caret. The custom per-character DOM expansion and MutationObserver are removed. Answer parts keep their index when tools arrive. Only text accepted by the published LingxiOS `model.delta` survives preview cleanup until the committed state arrives; cancelled, stale and superseded previews still retract.

## Recorded results

| Check | Result |
| --- | --- |
| 11k-character Chinese reply, before | 548 ms maximum event-loop interval, 5 visible states, 10,920 custom spans; responsiveness assertion failed |
| Same browser fixture, after | 69.3 ms maximum interval, 48 visible states, zero custom spans; passed |
| Browser renderer coverage | 5 passed: long conversation/tool insertion, light/dark/mobile, Markdown/code/table/citations, completion/cancellation, reduced motion |
| Published Worker integration | 3 passed: auto/deep, native transport, streaming before completion, durable delivery/reconnect, public activity order, tenant/thread isolation |
| Real provider | Passed; 148 non-empty preview frames, 10 measured calls, $0.02043061, zero final-answer retractions |
| Real Worker snapshot browser replay | Passed; 169 snapshots, 45 ms maximum interval (109 ms on the compressed-artifact repeat), zero unexpected blank frames; final DOM equals reload |
| Existing web/server smoke tests | 95/97 passed |
| Commit handoff and stale-preview regression | 4 passed; stale-event regression reproduced before the guard |
| Static checks | Web/server/E2E type checks, affected-file Biome lint and production web build passed |

The real provider still withdrew six unconfirmed drafts during tool/protocol retries. Those are explicit runtime resets, not durable replies; this change does not retain rejected drafts as answers. The browser replay checks that non-empty native snapshots render without blanking and that the final display matches canonical reload. It does not claim the provider never revises a candidate. Model latency and all possible production conversations are not covered.

## Repeat

Start the fixture from the repository root in one terminal:

```sh
node node_modules/vite/bin/vite.js --port 5196 --strictPort
```

In PowerShell, use the official browser engine:

```powershell
$env:E2E_BASE_URL='http://127.0.0.1:5196'
$env:E2E_STREAMING_FIXTURE='1'
$env:E2E_STREAMING_REPLAY='/artifacts/native-streaming/live/replay.json.gz'
npm run test:e2e:web -- --grep 'Native streaming conversation|Streaming renderer|Recorded native stream' --output .e2e/native-streaming
```

`live/replay.json.gz` contains only the synthetic integration conversation, and `live/result.json` records real-provider counts. `real-worker-replay.png` shows the rendered final reply. Deterministic Worker coverage can be repeated with `npm run test:e2e:server -- --file runtime-nonthinking.test.ts --file public-run-activity.test.ts` against the documented disposable local services.

The opt-in real-provider test is `runtime-streaming-live.test.ts`, invoked through `npm run test:integration -- --file runtime-streaming-live.test.ts`. It requires `LINGXIOS_LIVE_STREAMING=1`, a migrated disposable database named `lingxiloop_streaming_test`, `AGENT_OS_MAX_CONCURRENT_RUNS=1`, a local Redis instance, and ordinary test service/provider environment settings. Supply provider credentials externally; do not save them in evidence. Set the runtime model budget to at most 250,000 cost micros and ten calls. The test verifies measured ledger usage and rejects costs above $0.25.
