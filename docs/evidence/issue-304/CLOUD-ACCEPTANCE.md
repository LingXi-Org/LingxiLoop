# Current-cloud #304 interaction acceptance

The missing reduced-motion and narrow light-theme checks are now verified with
the official browser engine. The final clean candidate was
`875d21522ef484eeb131b0f6391e037bb739f55c`, based on main
`58c1a214590e56d35caf328553df5ee1f2c6c0f1` including PR315.
There is no change to `src`, `server`, production package manifests/locks or
release scripts relative to that baseline. This branch contains tests and
evidence only; it performs no production operation.

Official run `01a1649f-c7a6-7311-bf80-2937d9337a3d` passed **25/25**, with
zero failures, skipped tests, retries or flaky results. It used Node22.23.3,
`e2e@0.21.2`, `@e2e-dev/web@0.15.2` and Chromium156.0.8078.4. The new official
engine exposes `reducedMotion` as a public option. Its real Chromium
`matchMedia('(prefers-reduced-motion: reduce)').matches` returned true;
RunActivity/TaskCard transitions and the working task spinner obeyed the media
preference while keyboard controls remained usable. No direct Playwright, raw
CDP, dependency patch or fake `matchMedia` was used.

The 25 scenarios cover:

- The original12 answer-first regressions: actual v2 first-character delivery,
  DOM/CJK-selection/zero-shift accepted handoff, correction/new-request resets,
  one process disclosure, result and legacy fallback visibility, task navigation,
  source-version separation, generic continuation/approval uniqueness,96-entry
  history/retry/live races, manual scroll, body-only copy and visualization owner
  continuity/replacement/stale response rejection.
- A focused390px light/dark check using actual keyboard disclosure and a real
  wheel gesture. Trigger geometry and focus remain stable across each screenshot;
  closing restores visible body/results/citation controls without horizontal
  overflow. The light expanded capture now shows the actual top-level process
  and task controls, rather than only a lower panel.
- The genuine reduced-motion check described above.
- Failed/cancelled/incomplete body and status retention; partial/blocked artifact
  classification across reload; and discoverable, non-actionable approval waiting
  for a synthetic principal without control.
- The existing8 durable questionnaire cases: trusted binding, initial loading,
  read-only canonical replay, double submission/failure retry, lost receipt,
  pending/resume recovery and unavailable/foreign-owner forms.

All inputs are synthetic. The v2 fixture still uses the product projection,
AssistantTransport, decoder and run store over real localhost HTTP/SSE. A fresh
owning projection run passed8/8 and exported exactly the browser fixture bytes:
SHA256 `63baa4fce2b6003bb843a53321d643f305b28c499521871e37b82d5b3bcb16bb`.
The partial/blocked scenario verifies one stable artifact card/open control and
its honest incomplete state; the synthetic fixture does not provide a real deck
preview service. It is not evidence of a generated production presentation.
Final E2E TypeScript, focused Biome lint of all4 new TypeScript files and
`git diff --check` passed.
No private conversation, paid provider, real database, production corpus or
original-case manual acceptance was used. Issues259/260/264/298 retain their
separate original-case evidence boundaries.

## Evidence and corrections

[Native report](cloud-acceptance/accepted-report.json),
[JUnit](cloud-acceptance/accepted-junit.xml),
[summary](cloud-acceptance/accepted-summary.md) and
[input/artifact manifest](cloud-acceptance/manifest.json) retain the exact
candidate and hashes. All34 native screenshot artifacts were copied unchanged
under `cloud-acceptance/accepted-results/` and rehashed against the native report.
Light/dark expanded and body screenshots were inspected at their actual pixels.

Two earlier native runs remain preserved. The first passed13/14; the expanded
run passed23/25. Their failures were new fixture assumptions, not product
regressions: a spinner without a transition declaration has CSS's initial
`transition-property: all`; the existing global reduced-motion rule uses0.01ms
rather than literal0s; and one artifact card renders its title in both its preview
placeholder and caption. The final assertions require a real reduced preference,
no animation, transition duration below1ms, and one stable card/open control.
No product code was changed to make them pass. An initially missing fixture type
annotation was also corrected without changing runtime behavior.

The first direct projection launch omitted the normal synthetic `DATABASE_URL`
and exited during module initialization before assertions. Repeating with the
repository's ordinary synthetic unit configuration passed8/8. Both outputs are
retained; the successful run made no production/provider/database request.

## Repeating with isolated tools

The root's pinned web0.12.0 has no media option. The independently locked official
tools are in [cloud-tools/package.json](cloud-tools/package.json) and
[cloud-tools/package-lock.json](cloud-tools/package-lock.json); production and
root development locks are unchanged. Install these with `npm ci --ignore-scripts`
in a temporary tools directory. Use an isolated checkout with its own dependency
directory, or a read-only symlink overlay of the usual installed dependencies
that substitutes only `e2e` and `@e2e-dev/web` from that tools directory. This run
used the latter: existing dependencies were read from
`/workspace/LingxiLoop/node_modules`, while the two official tools and their own
dependencies lived in `/tmp/review304-tools`.

From this checkout, with that overlay in place:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/review304-browsers \
E2E_TELEMETRY_DISABLED=1 \
node /tmp/review304-tools/node_modules/e2e/dist/cli/bin.js run \
  --config e2e.answer-first-cloud.config.ts \
  --output .e2e/answer-first-cloud-repeat
```

The engine installs its exact browser through its own supported preparation.
The existing local fixture server has no production proxy or product env file.
The earlier evidence records in this directory remain historical: their prior
GitHub401, production403 and reduced-motion capability gaps are not current
failure claims.

## Deployment linkage

PR306 merged the product implementation as `4e2da56712e436af796c8f640a3f20f4d4b6c8bd`.
The [formal12:09/12:10 production record](https://github.com/LingXi-Org/LingxiLoop/issues/295#issuecomment-6340829174)
binds that commit, immutable image, full product54 and four healthy services.
The later [#312 production acceptance](https://github.com/LingXi-Org/LingxiLoop/issues/312#issuecomment-6343244521)
binds `5d073c66`, product54 and four healthy services. These are published
deployment evidence, separate from the fresh synthetic interaction result here.
The designated publisher owns final current-production verification and issue
closure. This supplemental test branch requires no product image or migration.
