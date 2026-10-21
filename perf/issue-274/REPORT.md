# #274 — recover resource preparation failures

Base: fetched main `63948c598b9778a35941f3dcabf8ef57e2e2d6d8`.
The reported text was reproduced with a complete synthetic card and the actual
pinned runtime: hold its first `gen-ui.js` response while all other resources
finish. Main fails at **15037.3ms**, before any iframe exists, with
`交互视图准备运行资源超时，请重试。` The verified candidate displays real, interactive
content at **5753.7ms**. This establishes a recoverable path, **not the cause or
resolution of the unobserved private production case**.

## Cause and scope

`prepareSandbox` includes the authorized page POST, resource response headers,
body reads and document assembly. One stuck GET previously exhausted the shared
15s deadline; a dropped body or transient HTTP error failed the whole card with
no safe-GET recovery. PR266 overlaps dependencies but does not address failures.
The old preparation label also conflated page acquisition with resource reads.

The candidate provides at most one recovery GET for an idle request (5s without
headers or body progress), connection/body failure, or HTTP 408/502/503/504 without
Retry-After. It waits 250ms before recovery. A valid slow first response remains
eligible to win; complete successful bytes cancel the other attempt. Partial
bodies are discarded. Streaming bytes reset the idle observation, and the original
15s initialization deadline still cancels every attempt and retry timer.

The request explicitly uses `cache: no-store`, matching the existing server
policy. In the browser trial with default request caching, the second same-URL
request did not reach the server while the first awaited headers, so that trial
still timed out. Explicit no-store lets the recovery request start independently.
There is no new application cache or cross-page capability reuse. Successful
sibling resources are read only once during automatic recovery.

Page POSTs, permission/not-found/rate-limit failures and any Retry-After response
are not automatically retried. The host now reports page acquisition separately,
and a global resource timeout names the still-pending static resource files.
No URLs, page tokens, conversation contents or user HTML enter those messages.

## Full path boundaries checked in source

- Save/delivery remains upstream of card acquisition. Page POST still authorizes
  the completed assistant reference and returns the DB HTML/state snapshot.
- Resource routes still check the page before and after manifest/path/integrity
  reads; each recovery GET traverses the same endpoint with the same scoped
  capability. Server code, authorization and resource bytes are unchanged.
- Frontend SDK imports are static, before the page controller. Server dynamic
  imports during authorization/page acquisition remain part of their HTTP phase;
  there is no production timing here to exclude their latency.
- The SDK guest runtime is downloaded as `gen-ui.js`, but its execution and
  handshake occur only after all document resources and the fresh-state read.
  The reproduced timeout has no iframe/SDK initialization stamp. Neither iframe
  boot policy nor that full-document barrier is weakened.
- PR266 ordering, late-state projection, isolated attempt keys, CSP, opaque nested
  iframe, gesture checks, retained-page behavior and disposal are unchanged.

## Finite browser evidence

Official `e2e` 0.17.0 / `@e2e-dev/web` 0.12.0; Chromium 153.0.8010.12;
1440×960; a single cold visible card; actual pinned CSS/kit/runtime/vendors.
Only the local HTTP failure/delay is synthetic. Ready observation requires SDK
initialization, nonempty content sizing, visible frame and two animation frames,
then actual D3 DOM and button interaction. Capture/runner overhead is outside
the measurement. No provider calls or production content reads.

| Condition | Candidate outcome | Entry to outcome | Runtime GETs |
| --- | --- | ---: | ---: |
| First response stuck | Usable content (baseline times out) | 5753.7ms | 2 |
| First body disconnected | Usable content | 763.9ms | 2 |
| First response HTTP 503 | Usable content | 763.8ms | 2 |
| Body streams for 8s with progress | Usable content; no restart | 8583.3ms | 1 |
| Each response waits 6s for first byte | Original response wins; second cancelled | 6482.5ms | 2 |
| Persistent disconnection | Named network error; explicit retry then works | 353.2ms to error | 2, then 1 on user retry |
| HTTP 403 | Named 403 error; no automatic retry | 47.4ms | 1 |
| HTTP 503 with Retry-After: 60 | Named 503 error; no automatic retry | 59.2ms | 1 |

8/8 recovery cases pass. Successful recovery uses one page and nine total resource
GETs (one extra runtime GET); the 8s progressing case uses eight. Explicit retry
after disconnection creates a usable guest and leaves one active page. No
unhandled rejection was recorded in these cases.

Two additional existing deadline/cancel/retry regressions pass: held acquisition
and held resources still fail at the original ~15s phase transition, abort pending
work, and recover while DELETE cleanup is held. Errors now distinguish
`申请页面超时` and `准备运行资源（等待 …）超时`. The observer intentionally samples at
16.5s; raw phase timestamps retain the actual transition. Browser connection
limits mean not all scheduled recovery GETs necessarily reach a stalled server.

Owning four-file lint, scoped helper/contracts/fixture/test/config TypeScript,
original guest build and pinned upstream verifier (223 files) pass. Full project
TypeScript remains blocked by the absent private `@lyyzka/lingxios@3.6.0` package.
The earlier registry 401 was not retried without new access evidence. This task
used an isolated Web-only install retaining the other lockfile versions; no
manifest, lockfile, runtime substitution or credential changes. Full build/tests,
exact-candidate CI and independent review belong in the integration environment.

## Limits and reproduction

At most two requests per resource can overlap; a late first byte can cause one
extra GET. There is no new global admission limit. Permanent offline, continuing
server saturation, corrupt assets, a slow page POST, or an insufficient total
15s budget can still fail. Real production timing is unavailable, and no original
private case was opened. The error is more specific rather than hidden.

```sh
npm run build:visualize-runtime
E2E_TELEMETRY_DISABLED=1 PLAYWRIGHT_BROWSERS_PATH=/workspace/e2e-browsers \
  E2E_VISUALIZE_OUTPUT=.e2e/274-verified \
  node_modules/.bin/e2e run --config e2e.visualize-resources.config.ts
E2E_TELEMETRY_DISABLED=1 PLAYWRIGHT_BROWSERS_PATH=/workspace/e2e-browsers \
  E2E_VISUALIZE_OUTPUT=.e2e/274-deadline \
  node_modules/.bin/e2e run --config e2e.visualize-timeout.config.ts --grep 'covers (create|resources)'
```

For the red case, retain the new fixture/test on the stated main product files
and select `--grep stall-once`. [Evidence](evidence/) includes raw observations,
runner reports, checksums and a synthetic screenshot; full trace ZIPs stay local
under `.e2e/274-*`. No user screenshot or private HTML is included.

Only issue/code/draft PR delivery. No merge, deployment or production writes;
the sole integrator owns those operations. Issue remains open pending validation
of the actual case and integration review.
