# Isolated-lock #304 cloud acceptance

Status: qualified isolated dependency graph,25/25 official browser cases and8/8
projection checks passed. This is the corrective acceptance result for PR316's
dependency-underlay review P2.

PR316 review identified44 mismatches among127 production direct dependencies in
the earlier shared underlay. That genuine25/25 browser run remains historical;
its source commit and root lock hash did not prove the installed dependency graph.
The [historical full inventory](locked-cloud-acceptance/historical-underlay-inventory.json)
records the actual drift, including development dependencies separately.

The corrective environment uses `npm ci --prefer-offline --no-audit --no-fund`
inside `/workspace/review-pr315`, through the existing command-scoped registry
authentication. It added1494 packages and exited0. No startup/latest refresh was
run, shared-root dependencies were not changed, no credential was persisted, and
production manifests/locks remained unchanged.

- [Before tool overlay](locked-cloud-acceptance/installed-before-tools.json):
  all153 direct dependency versions match their exact root-lock entries.
- [Effective browser graph](locked-cloud-acceptance/installed-before-browser.json):
  all127 production direct dependencies still match and resolve inside this
  worktree; the only two direct version overrides are the separately locked
  official `e2e@0.21.2` and `@e2e-dev/web@0.15.2` testing tools.
- [Installation receipt](locked-cloud-acceptance/installation-receipt.json).

## Corrective result

The final clean browser candidate was
`d4fcd82beda4e7f0f46f4ee86a36f47bf1c3871e`. Official run
`01a164b3-ee47-7c82-9f37-a22d63280ded` passed25/25, with zero failures, skipped
tests, retries or flaky results, in179.51 seconds. See the
[native report](locked-cloud-acceptance/accepted-report.json),
[JUnit](locked-cloud-acceptance/accepted-junit.xml) and
[summary](locked-cloud-acceptance/accepted-summary.md). All34 original screenshot
artifacts were copied unchanged and checked against their native sizes/SHA256.
The current light/dark390px expanded/body captures and reduced-motion capture were
inspected at their actual pixels.

The production dependency graph remained unchanged throughout the run:

| Package | Root lock | Installed |
| --- | --- | --- |
| react | 19.2.8 | 19.2.8 |
| @assistant-ui/react | 0.15.16 | 0.15.16 |
| @radix-ui/react-collapsible | 1.1.20 | 1.1.20 |
| streamdown | 2.6.0 | 2.6.0 |

These are examples; the before/after inventories enumerate **all127** production
direct dependencies. The [after-run inventory](locked-cloud-acceptance/installed-after-browser.json)
is identical to the before-run graph, including actual package paths. All127
match the root lock and resolve inside this isolated worktree. Among all153
direct dependencies, the only two mismatches remain the explicit, separately
locked official test-tool overrides. The installed npm metadata hash also
remained `943081cae267d19443ed4cbe0dd19ef6b611313e99bc24e1c58f6f2222f943c3`.

The fixture now resolves its cache directly to this checkout's
`.e2e/answer-first-locked-vite-cache`, which was absent before the final run.
The directory was actually created by that run. All52 optimized dependency
source origins resolve to this worktree's node_modules; none refer to the shared
underlay. The [optimizer receipt](locked-cloud-acceptance/optimizer-origins.json)
binds those origins and built-file hashes, and the original
[optimizer metadata](locked-cloud-acceptance/optimizer-metadata.json) is retained.

The owning projection selection passed8/8 on the same exact application graph.
Its regenerated export still matches the browser input byte-for-byte:
SHA256 `63baa4fce2b6003bb843a53321d643f305b28c499521871e37b82d5b3bcb16bb`.
See [raw output](locked-cloud-acceptance/projection-results.txt). Only the requested
25 browser and8 projection checks were repeated; earlier lint/typecheck results
remain historical and are not represented as fresh checks under this install.

The cases retain the original scope: real localhost HTTP/SSE through the product
projection/decoder/store; native v2 first-character/accepted handoff, CJK selection
and zero shift; corrections and source ownership; one process entrance, visible
results/current attention, history and scrolling; true reduced-motion media with
motion disabled and usable keyboard controls;390px light/dark framing; honest
terminal/partial/blocked states; approval control boundaries; and durable
questionnaire retry/replay. All data is synthetic. This does not replay a private
production case, execute a paid provider, access a real database/corpus, or perform
production operations. Final production image/service checks remain separate.

## Preserved preparation history

The first locked run was intentionally interrupted to isolate the fixture cache;
its [native report](locked-cloud-acceptance/cache-isolation-interrupted-report.json)
has3 passes,1 interruption and21 skipped tests and is not acceptance. A following
locked run passed25/25, but the runner filtered the custom cache environment
variable, so the requested cache directory was not used. That
[report](locked-cloud-acceptance/pre-cache-isolation-report.json) is retained
separately. The final run above uses the direct per-worktree cache configuration
and verified actual origins. Neither preparation run is relabelled as the final
acceptance result. The earlier shared-underlay reports also remain unchanged as
history, with their dependency limitation explicitly marked.

## Repeat

Use an isolated checkout with a fresh root `npm ci` under existing authorized
registry authentication. Do not substitute application packages from a shared
node_modules or run a startup/latest refresh. Confirm all153 direct versions
match the root lock before substituting tools; all127 production versions must
still match afterward. Install the exact official tools using the existing
`cloud-tools/package-lock.json` in a separate temporary directory, and replace
only this checkout's `node_modules/e2e` and `node_modules/@e2e-dev/web` with links
to those two packages. The originals may be retained inside this checkout's
ignored `.e2e` directory. Do not alter root/production locks or the shared root.

Run from that checkout:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/review304-browsers \
E2E_TELEMETRY_DISABLED=1 \
node /tmp/review304-tools/node_modules/e2e/dist/cli/bin.js run \
  --config e2e.answer-first-cloud.config.ts \
  --output .e2e/answer-first-cloud-locked-repeat
```

The cache location is derived from the checkout, without an environment variable.
For a fresh acceptance checkout, verify the cache is absent before execution and
retain actual before/after dependency receipts and native artifacts. The
[manifest](locked-cloud-acceptance/manifest.json) binds this run's source inputs,
root/tool locks, inventories, optimizer proof and evidence files.
