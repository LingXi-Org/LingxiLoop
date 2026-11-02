# Sidebar Design canvas loading

Baseline `0d231b60`; measured product implementation is included in `ec81952e`.
The same #611 production UI, grant-isolated gateway and generated editor
assets run in both arms. Only documents, grants and state API replies are local
synthetic fixture data. This is click-to-editable canvas, not whole-app startup.

## Confirmed redundant work

The pinned editor already prepares a complete Blob containing its bundled
React 18.3.1 production UMD, support runtime and exact math program. Its selector
nevertheless preferred a second external runtime. That extra program is
1,795,510 decoded / 468,227 Brotli bytes; its bundled React 18.3.1 is a
development build. The main entry already contains the complete working
fallback/export programs. The original selector regression failed by selecting
the external URL even when the prepared Blob was available.

The build now prefers the prepared Blob, then the external URL if that fails,
then the existing inline program if both fail. Removing the external preload
means the unused recovery path no longer downloads during normal startup.
An exact source assertion binds this adaptation to the pinned upstream.
The source strings used by Blob, inline fallback, capture and standalone export
are unchanged; the external fallback remains packaged and available. No data
model, runtime protocol, CSP, grant authorization or editor rendering code was
removed or replaced.

## Actual paired results

Ten alternating AB/BA pairs for cold, retained reopen and warm new scope:
60 observations. Chromium 148.0.7778.96, Windows 11, 1440×1000,
20 ms latency, 4 Mbps download, 3 Mbps upload, CPU 1×; the same CDP profile
applies to every iframe. No concurrent build/browser benchmark ran during
these pairs. Nearest-rank p50 / p75 / p95, in milliseconds:

| Click to an editable heading | Baseline | Candidate |
| --- | --- | --- |
| Cold canvas | 6,102 / 6,155 / 6,457 | 5,131 / 5,164 / 5,257 |
| Retained reopen | 144 / 152 / 174 | 142 / 160 / 165 |
| Warm assets, new scope | 820 / 833 / 991 | 790 / 814 / 910 |

Cold p75 improves **16.1%**. Cold transferred bytes fall **19.2%**,
2,446,997 → 1,977,246. Retained reopen transfers zero bytes in both arms;
its p75 is 8 ms higher and is reported as effectively unchanged, not a speedup.
`evidence/design-paired.json` retains every sample and sanitized request trace.

## Validation

- Five build/math tests passed, including the regression-first selector test,
  every precompressed asset's byte roundtrip, exact executable-source preservation,
  complete inline math parsing, acknowledged mount behavior and external metadata.
- The actual browser renders and edits six formulas through each of the three
  native paths: prepared Blob (zero external runtime requests), deliberately
  revoked Blob → external URL, revoked Blob plus blocked URL → inline fallback.
- All paths retain dynamic formula updates, ordinary prices, malformed-formula
  source and the same iframe on reopen. Screenshots at 1440px/768px are retained
  for all three paths; these are visual evidence, not claimed pixel identity.
- A real heading edit persists via the editor's CAS publish path, survives page
  refresh, and remains isolated from another conversation.
- `evidence/design-regressions.json` records the outcomes. Diff whitespace checks
  passed. The standalone export program's bytes are preserved by the build
  tests; an actual download/export UI flow was not exercised here.

## Remaining cost

The candidate's first cold trace still transfers 1,817,178 bytes for the
monolithic editor entry (92% of total), 102,893 for its used fallback font (5.2%),
46,536 for CSS (2.4%) and about 10 KB of other document/API/UI responses.
No Babel, fast-edit worker or optional capture asset is downloaded in this path.
At 4 Mbps the retained 1,977,246 bytes alone imply about **3.95 seconds** of
transfer, before authorization, parsing and layout. The measured 5.16-second
cold p75 therefore must not be described as a one-second cold open. Warm new
scope and retained reopen are separate measurements.

Further substantial reduction requires splitting the archived editor bundle.
Its capture/export/preview consumers currently expect synchronous source strings,
including the 639 KB self-contained math renderer; removing those strings would
break those consumers without an asynchronous loading change. The remaining
large network requests are used by this actual view. No speculative bundle
rewrite is included in this bounded fix. Firefox, Safari and the user's actual
production artwork were not exercised; this task does not deploy production.

## Reproduce

Build the normal runtime/editor once at the baseline and copy its generated
`server/assets/design-editor` to `.codex-tmp/design-baseline`, then rebuild at
the candidate. Build the #611 UI fixture with
`node perf/issue-611/build.mjs . .codex-tmp/genui-candidate`.
Create a short-lived test certificate with the #611 recipe under
`.codex-tmp/design-tls/{key,cert}.pem`. In separate shells start the existing
#611 HTTPS server on ports 4299/4300 with `PERF_TLS=1`,
`PERF_TLS_KEY=.codex-tmp/design-tls/key.pem`,
`PERF_TLS_CERT=.codex-tmp/design-tls/cert.pem`, and `PERF_DESIGN_DIST` pointing
to the baseline copy or candidate generated editor respectively:

```sh
node --import tsx perf/issue-611/serve.ts . .codex-tmp/genui-candidate 4299
node --import tsx perf/issue-611/serve.ts . .codex-tmp/genui-candidate 4300
python perf/issue-626/design-regression.py
python perf/issue-626/design-bench.py
node --test scripts/design-editor.test.mjs scripts/artifact-math.test.mjs
```

Browser trust is pinned to only this generated test certificate. The fixture
accepts explicit certificate paths and serves its exact index file from an
ignored dot-directory; product trust/security configuration is unchanged.
