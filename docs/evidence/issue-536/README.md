# #536: saved visualization startup

Base: `40605b36690e911ef958a082286a0a78acaa2556`. Local environment: Node 24.19.0,
locked root dependencies. This branch changes saved/authorized document loading;
it does not change #533 authoring or delivery contracts.

## Implemented

- The exact pinned kit uses base styles, tabs and the existing GenUI/MCP runtime.
  Initial tooltip/carousel/icon markup waits only for its declared capabilities;
  dynamically inserted markup loads those capabilities on demand. Explicit author
  Lucide/Floating UI APIs and unknown kits retain their original synchronous kit.
  Full Lucide remains the compatibility implementation when icons are needed.
- The screenshot ESM bundle loads only upon a private capture request. The first
  trusted script establishes the loader, captures native operations, validates
  SRI via modulepreload, and retains module exports lexically. It never reads a
  later author replacement global. Failed capture loads clear their Promise;
  recovery uses a new module identity to avoid a poisoned browser module-map entry.
- Fixed bytes are emitted at `/assets/visualize-<sha256>.<ext>`, without page or
  tenant capabilities. Existing static delivery/retention supplies immutable
  caching and old-version URLs. Only these exact public paths gain anonymous
  CORS for opaque-frame SRI/module loading. HTML/state/page APIs remain private
  and no-store; the existing live-page checks still surround legacy resource reads.
- Page-independent manifests and verified bytes are cached per server process,
  with cold-read coalescing, an 8 MiB budget and failure eviction. Host memory
  verification/deduplication remains. Missing old static hashes can fall back to
  the authorized legacy resource route during the first rollout.
- Retained iframe identity, scheduling, dual opaque sandboxes, gesture checks,
  MCP/state ordering, D3/calendar order and export fallback remain in their owners.
  CSP adds only exact immutable optional asset URLs; connect-src remains none.
  Vendored upstream files and root/server dependency locks are unchanged. The
  derived integration profile includes the already locked html-to-image package
  because that CI job also builds the capture bundle.

## Source-byte evidence

Reproduce with `npm run build:visualize-runtime` followed by
`node scripts/issue-536/compare-resource-bytes.mjs`. The existing
`e2e/visualize/fixtures/performance-static.html` is assembled before/after with
identical dependency bytes. Raw resource names, sizes and hashes are in
[resource-comparison.json](resource-comparison.json).

| Source bytes, uncompressed | Before | After |
| --- | ---: | ---: |
| Blocking resource reads | 1,305,587 (6 reads) | 681,127 (3 reads) |
| Assembled inner document | 1,330,337 | 675,965 |
| Inline executable scripts | 1,297,549 | 642,856 |

These are deterministic source sizes, not network transfer, JavaScript CPU,
paint or interaction samples. The GenUI bundle itself remains 633,011 B.
No claim is made that loading time or its median fell by 50%.

## Checks run

- `npm run build` (includes Web typecheck, pinned upstream verification and runtime build): passed.
- Scoped dependency generation/consistency checks and existing profile tests: passed.
- `npm run server:typecheck`, `npm run lint`, `npm run server:lint`: passed;
  Web lint reports existing warnings.
- 32 focused Node tests: passed. The command and raw output are in
  [focused-tests.txt](focused-tests.txt). They cover conditional dependencies,
  private lazy capture and hostile globals, retry/observer-loop boundaries,
  state/cancellation, immutable URL/header isolation, old-hash fallback, byte
  verification/cache bounds and current/retained static CORS responses.
- All 11 emitted public assets were byte-compared against their SHA-256 URLs and server source files: passed.
- Affected E2E fixture/type sources: passed with
  `node_modules/.bin/tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --strict --skipLibCheck --types node e2e/visualize/fixture-api.ts e2e/visualize/performance.e2e.ts`.
- `npm run test:e2e:typecheck`: failed outside Visualize, including existing
  `e2e/react-delivery/recovery.e2e.ts` browser-evaluate JSON types and unresolved
  `@/` imports in chat runtime files. No Visualize diagnostic was reported.
  These unrelated files were not changed.

## Performance boundary and manual verification

No browser, production write, load experiment, merge or deployment ran. Cloud
browser verification was explicitly waived by the user. No real paint, initial
clipboard operation, cross-refresh HTTP-cache hit or interaction timing is
claimed. Independent final-candidate review remains with the parent integrator;
no additional review task tree was created.

For a later human check, use the same production build/device/network and saved,
authorized fixture on both revisions. Separate generation/save/delivery from
page acquisition; start the loading clock only once the authorized reference is
available. In DevTools leave Disable cache off, record a cold open, normal refresh,
second card and three-card history; capture actual SVG/canvas visibility and a
real control result rather than treating MCP ready as paint. Record raw samples,
request/transfer sizes, long tasks and iframe initialization counts. Verify that
same-hash public bodies are not transferred again on normal refresh, while page
and state authorization still occurs. Exercise tooltip focus/touch, carousel
arrows, inserted icons, D3/calendar, first clipboard export and a failed optional
read followed by retry. Existing `e2e.visualize-377.config.ts` and startup,
first-card/offscreen fixtures remain available through the official E2E engine;
the 377 fixture now serves and records hashed public resources too. Its dev-server
timings are not a substitute for a production-build comparison.

Rollback: revert this branch's product adaptation and build/static changes as one
unit. No database migration or mutable document conversion is involved. Keep the
existing retained immutable assets so already-open frames and old clients can
finish normally. Production release ownership stays with the designated parent
integrator.

The capture loading model follows the HTML standard's
[modulepreload/module map behavior](https://html.spec.whatwg.org/multipage/links.html#link-type-modulepreload).
