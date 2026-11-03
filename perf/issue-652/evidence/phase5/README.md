# Phase 5 evidence

See [PHASE5.md](../../PHASE5.md) for measured source, scope, limits and results.
Prior phase directories are immutable. `checksums.json` hashes this directory's
files except itself. Browser content/grants/installed components are synthetic.
No credentials or real user documents are present.

Use Node 22 and the existing dependencies, Python Playwright and Chromium.
TLS/host fixture setup follows [the issue README](../../README.md). Build
assets before browser measurements; do not build while qualifying/timing.

Focused checks:

```sh
node --test scripts/design-editor.test.mjs
node scripts/build-slides-editor.mjs
python -m py_compile perf/issue-652/bench.py perf/issue-652/typed-components.py perf/issue-652/design-init-profile.py
```

The Slides rebuild here restores unmodified Phase 4 outputs; it is not a new
Slides optimization. For the typed-system fixture, run the existing server
with `PERF_TLS=1`, its synthetic TLS paths, `PERF_RECOVERY_FIXTURE=1`,
`PERF_TYPED_COMPONENT_FIXTURE=1` and
`PERF_FAIL_DESIGN_OPTIONAL=propertyScrubber`, on 4413:

```sh
node --import tsx perf/editor-open/serve.ts . .codex-tmp/issue-652/host-final 4413
python perf/issue-652/typed-components.py 4413 .codex-tmp/issue-652/phase5/typed-components
python perf/issue-652/typed-components.py 4413 .codex-tmp/issue-652/phase5/typed-components-narrow 768
```

These are sequential commands; the fixture server must run separately. Do
not run the two browser checks concurrently. The test observes the native
selection change and uses the actual inferred radio control, rather than
assuming the property is an ordinary button.

The control is `a80e6589cb64328800563f56cb61b19202d031da` rebuilt in an isolated
source copy with its owning `scripts`, `shared` and `third_party` inputs and
the same dependencies. Its complete Design output hash map must equal the
Phase 4 provenance. Serve that Design directory with `PERF_DESIGN_DIST` on
4414 and the qualified candidate on 4412. Both use the same unmodified
`host-final`. No recovery/feature-fault flags for performance servers:

```sh
python perf/issue-652/bench.py 10 .codex-tmp/issue-652/phase5/paired-design.json.gz control=4414 candidate=4412 --kinds=design
python perf/issue-652/retained.py 4412 .codex-tmp/issue-652/phase5/retained-desktop.json
python perf/issue-652/retained.py 4412 .codex-tmp/issue-652/phase5/retained-narrow.json 768
```

`assessment.json` explicitly assesses the changed Design source only. It
neither changes the fixed budget nor invents new Slides cold samples. The
Phase 4 whole-issue assessment remains failed. The retained checks include
both real editors and do not count as cold acceptance.

Factory diagnostics operate on **new copies**, never the qualified assets:

```sh
node perf/issue-652/design-init-profile.mjs <a80-built-design> <new-control-copy>
node perf/issue-652/design-init-profile.mjs server/assets/design-editor <new-candidate-copy>
```

Serve these copies using `PERF_DESIGN_DIST` on 4417/4418, then:

```sh
python perf/issue-652/design-init-profile.py 3 .codex-tmp/issue-652/phase5/factory-timings.json.gz control=4417 candidate=4418
```

The copy builder refuses existing output paths. Three diagnostic pairs are
not ten-pair cold acceptance. Every initializer/install duration, timer
resolution and instrumentation overhead remain visible in the raw data.

`cpu-profile-capture.py` and `cpu-profile-summary.py` are the exact diagnostic
capture/summary scripts used before the product change, for the Phase 4
`a80e6589` main entry. They use 4412 and the scratch Phase 5 paths. Reproduce
them only with that source's editor bytes on 4412, matching the URLs/hashes
in the raw profiles; their source label is historical. V8 sampling overhead
and nested/streaming timeline events preclude treating those traces as
ordinary cold-open measurements or summing nested durations as CPU.

`dead-functions-prototype.mjs` is a discarded static experiment; it does not
participate in the product build. It produced only 2,364 additional Brotli
bytes of saving. `audit-receivers.mjs` resolves the current eight named
receiver targets for reviewer inspection; mutable alias writers still need
review on future native changes.
