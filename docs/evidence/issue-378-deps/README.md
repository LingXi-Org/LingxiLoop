# #378 A: formal Markdown dependency fixes

Baseline: `47b92860279b8b5111932b8e528383f25fed67ce`.
Scope: root manifest/lock and focused dependency verification only. B/C rendering,
D/E state work, F/G layout profiling and the issue's eventual release are separate.

## Failure model, before implementation

- Updating only the manifest could leave the old deployed packages; verify the
  registry tarball integrity, exact lock identities and actual resolved modules.
- An unconstrained install could update unrelated dependencies or run upstream
  scripts; use exact versions, lock-only/ignore-scripts and inspect every delta.
- The default, non-deferred Streamdown path can add a deferred render pass.
  Verify the formal package contains the upstream direct/deferred split without
  changing product flags; SSR alone cannot measure React render-pass savings.
- Tail delimiter scanning can inspect the remaining suffix on each line. Compare
  the actual baseline/candidate package functions on identical synthetic inputs,
  including fences, math, incomplete syntax and Unicode; count searched bytes
  separately from elapsed time, and retain any output differences.
- Updated Markdown components could alter citations, mentions, code or interrupted
  text. Run the existing owning renderer checks with the actual candidate packages
  resolved from a private dependency overlay. Never mutate shared node_modules.
- The package source/API audit and local SSR checks do not establish browser FPS,
  user-device latency, production deployment or closure of all #378 work.

## Package and API audit

The official source is MIT `assistant-ui/assistant-ui` at
[`af7466155560aa3ff364abf57e89c7209882ab0d`](https://github.com/assistant-ui/assistant-ui/tree/af7466155560aa3ff364abf57e89c7209882ab0d).
The issue's upstream fixes are [PR6732](https://github.com/assistant-ui/assistant-ui/pull/6732)
and [PR6941](https://github.com/assistant-ui/assistant-ui/pull/6941).
Both old and new tarballs were downloaded directly from registry.npmjs.org,
verified against its SHA512 integrity before extraction, and their licenses read.
Registry metadata does not supply `gitHead`; no such provenance is invented.
Instead, the twelve changed implementation files were separately fetched at the
fixed official commit and matched byte-for-byte (`source-proof.json`).

`packages.json` records the four tarball identities. The exact new versions are
`@assistant-ui/react-streamdown` **0.3.14** and `@assistant-ui/react-markdown`
**0.14.15**. `npm install --package-lock-only --ignore-scripts --save-exact
--no-audit --no-fund --cache /tmp/loop378deps-audit/npm-cache
--registry=https://registry.npmjs.org ...` generated the lock normally.
Only those two package entries and the root dependency specs changed. The first
attempt failed because the default npm cache directory did not exist; the private
task cache fixed that environment problem. No lifecycle script, credential change
or shared dependency write occurred.

The candidate requires react-markdown `^0.14.15` and remend `^1.3.1`; already locked
remend **1.3.1** meets the latter. Streamdown **2.6.0**, React **19.2.8**, assistant-ui
**0.15.16**, LingxiOS and every other lock entry are unchanged. The public exports
used by `markdown-text.tsx`, its block callback and plugins remain compatible.
There is no product preprocess/remend/defer override: the default direct body
now avoids mounting the deferred hook path. `defer` must remain constant during a
component lifetime if ever enabled; this change does not enable it.

The actual package delta is broader than the two performance fixes:

- Boundary scanning uses a current-line character walk instead of repeated
  remaining-suffix `$$` searches. It still scans accumulated text; it is not O(1).
- Settled prefixes now retain numeric-range/comparison escaping while incomplete
  syntax completion remains tail-only. Prefix-safe remend handlers can run on both
  prefix and tail; this product does not configure custom handlers. This adds
  prefix work, so boundary-only timing is not an end-to-end remend benchmark.
- Optional math normalization preserves code spans/fences and emits proper
  multiline boundaries. The product currently does not call that optional API.
- Code/pre adapters preserve custom headers, raw pre fallbacks and stable wrapper
  identities. The existing Markdown rendering suite covers the active product
  code, citation, mention, math and lifecycle paths.

## Actual checks and same-input comparison

Node **22.23.3**. Private baseline/candidate overlays contain physical copies of
the two integrity-verified packages and read-only symlinks to all unchanged shared
dependencies. Module resolution therefore loads the actual package bytes under
test; no resolver mocks or changes to package source/version were used. This is
not a full clean installation; exact CI supplies that separate gate.

- New dependency regressions on old formal packages: **0/3** (expected failures),
  retained in `dependency-red.tap`.
- Existing product Markdown suite on old packages: **12/12**, in
  `renderer-baseline.tap`.
- The same product suite plus three new regressions on candidate packages:
  **15/15**, no skips, in `candidate-owning.tap`.
- Focused Biome lint: two new source files passed, no fixes. No product renderer,
  B/C animation, D/E transport/state, CSP, permissions or server implementation
  was modified.
- Full `npm run typecheck` passed against the candidate overlay. The first attempt
  lacked server source imported by existing frontend tests in this sparse checkout;
  restoring the unchanged tracked `server/src` files resolved those missing-module
  errors. Both the failed and successful logs are retained in this evidence set.

`same-input.json` contains six input hashes and actual public-function outputs:
mixed Chinese/Markdown/citation/mention, code fence, open fence, math and Unicode
outputs are byte-identical. The sixth comparison deliberately changes settled
`20~25`/`- > 25` escapes, preserving their numeric/comparison meaning. The separate
optional normalization example keeps literal math markers inside code rather
than rewriting the example. Both versions select the same repair-window boundary
for all six inputs.

For paragraph-dense inputs, requested `indexOf('$$')` search spans were
16,009,004 / 256,036,004 UTF-16 units on the old boundary function and zero on the
new character-walk function (16,004 / 64,004 input units). Zero here means no such
substring search, not zero scanning work. Three warm Node samples at 4,000
paragraphs had medians about **8.62 ms / 0.60 ms**; at 1,000 paragraphs they were
about **0.88 ms / 0.93 ms**. The small sample is noisy; no browser-frame or whole
render improvement is inferred.

Reproduce after an ordinary clean installation of the exact lock:

```sh
node --import tsx --experimental-test-module-mocks --test --test-force-exit \
  src/components/assistant-ui/streamdown-dependency.test.ts \
  src/components/assistant-ui/markdown-text.test.tsx
node scripts/compare-streamdown-deps.mjs /path/to/verified/old/package /path/to/verified/new/package
```

The comparison directories need their unchanged dependency resolution available,
as in the private overlays; the script performs no installation or network call.
Rollback reverts the manifest, lock and owning regression together. This is only
section A of #378: browser profiling, B–G and actual release remain separate.
