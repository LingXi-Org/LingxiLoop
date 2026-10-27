# #536: saved visualization startup

The current static HTML/SVG first-frame resource set is **307,351 B in two fixed
requests**, down from the first draft's 681,127 B in three. Local gzip of those
two bodies totals 81,670 B; these are byte measurements, not browser timing.
Page acquisition and fresh authorized state reads still happen separately.

Original base: `40605b36690e911ef958a082286a0a78acaa2556`.
First draft baseline: `6448a9c6943033e1185cc050a28713185258b054`.
Node 24.19.0, root locked dependencies. This branch changes saved/authorized
loading, not #533 authoring/delivery contracts. No browser or production sampling.

## Dependency audit and actual cuts

[dependency-audit.json](dependency-audit.json) records esbuild's actual output
contributions before/after, source paths, import adaptations and icon bytes.
The first draft's 633,011 B GenUI bundle accounted for 93% of its mandatory bytes.

| Resource/function | Evidence and action | Effect/compatibility |
| --- | --- | --- |
| Zod's aggregated `z` namespace | The guest and official ext-apps import `{ z }`. With the locked esbuild this retains the whole aggregate. Build-only rewriting to the equivalent `import * as z` allows real dead-code removal. Original files remain immutable. | GenUI 633,011 → 282,127 B. Same official App, Protocol and Zod constructors/validators. No permissive schema substitutes. |
| All Zod error languages | Output contribution was 263,831 B; no guest source selects a locale. | Only the existing default English error formatter remains: 2,688 B. No product labels/locale behavior removed. |
| Unused Zod compiler and JSON→Zod converter | Actual output contributions were 29,440 B and 12,191 B, retained by the aggregate export rather than called by the guest. | Both are absent from output. State/message parsing and schema validation remain. |
| Default whole kit HTML | The 17,507 B template was still fetched then stripped in the first draft. | Known kit no longer fetches it. Tabs are a 1,386 B independent controller, present initially only for declared tablists and loaded for dynamic tablists. Unknown kit versions retain the original template path. |
| Full icon package for four known names | Acceptance fixture uses Play; the generator's skill example uses Search; carousel controls inject ChevronLeft/Right. | Derived official Lucide renderer and identical four node definitions: 601,680 → 3,202 B. Unknown icon names and explicit author Lucide APIs retain the full pinned library on their own path. No handwritten icon engine. |
| Full kit for an explicit library API | Previously an author Lucide reference pulled Floating UI too. | Explicit Lucide waits only for Lucide; explicit Floating UI retains Core→DOM order without Lucide. No default all-component kit. |
| Fixed stylesheet | Generated class/token contract and legacy aliases are real supported authoring surface; safe unused-selector proof is unavailable. | Keep its rules and tokens; minify 30,609 → 25,224 B. No speculative selector deletion. |
| Fonts | The fixed stylesheet uses system font stacks and no external font-face/import. | There is no fixed downloaded font asset to remove. Authored external fonts remain subject to the existing CSP. |
| Tweak/state/follow-up/link APIs | Actual acceptance, learning, bridge and performance fixtures use them; the host has dedicated handlers. | Retained. No guessed removal of core controls, saved state or continuation. D3/calendar remain conditional. |
| Capture UMD fallback | Current hosts use the private on-demand capture ESM module. | Old UMD is now also a lazy host import, used only when old metadata lacks a capture module. It leaves the current host's startup chunk. |

These are removal/minification changes, not merely postponed parsing of the same
mandatory 633 KB bundle. Remaining largest payload is the official MCP/validation
runtime (282,127 B); replacing its wire implementation or stripping validation is
outside this cut. The alternative prebundled `app-with-deps` plus required product
Zod schemas was experimentally larger and was not adopted. Generic component
frameworks, browser Babel and a downloaded font pack were not introduced.

## First-frame byte comparison

Reproduce with `npm run build:visualize-runtime` then
`node scripts/issue-536/compare-resource-bytes.mjs`. It uses the same existing
`e2e/visualize/fixtures/performance-static.html`, rebuilds and verifies the
historical 633,011 B guest hash, and assembles all three document versions.
[resource-comparison.json](resource-comparison.json) contains resource names,
hashes, request counts and raw/local-compression results. gzip/Brotli are local
Node defaults, summed per response body; they are not observed HTTP transfers.

| Static fixture | Original | First draft | Current |
| --- | ---: | ---: | ---: |
| Fixed resource requests | 6 | 3 | **2** |
| Fixed resource bytes | 1,305,587 | 681,127 | **307,351** |
| Same bodies, local gzip | 270,309 | 151,295 | **81,670** |
| Same bodies, local Brotli | 217,445 | 122,942 | **67,953** |
| Assembled inner document | 1,330,337 | 675,965 | **318,633** |
| Inline executable scripts | 1,297,549 | 642,856 | **290,744** |

Current fixed minimum is `gen-ui.js` 282,127 B + `kit.css` 25,224 B. Pure HTML/SVG
loads no template, tab/carousel/tooltip controller, Lucide or screenshot module.
A declared component adds only its dependencies. These byte reductions do not
establish a 50% improvement in median real paint/interaction time.

## Retained boundaries

Fixed assets use `/assets/visualize-<sha256>.<ext>`, anonymous fetch/SRI and existing
immutable static retention. Server manifests/verified bytes retain cold-read
coalescing, an 8 MiB budget and failure eviction. Older static hashes can use the
authorized legacy resource route during the first rollout. Upstream sources,
licenses, root/server locks and runtime versions are unchanged. The first draft
already added the pinned screenshot dependency to the derived integration graph.

Private HTML/state/page capabilities retain authorization and no-store. Page
acquisition/fresh-state reads, gestures, retained iframe identity/scheduling,
MCP sequencing and dual opaque sandboxes remain. CSP adds only exact immutable
script URLs; connect-src remains none. Screenshot initialization still captures
its loader before author scripts, uses the private channel and lexical module
exports, and retries failed loads without permanently reusing failed Promises.

## Checks run

- 40 focused Node tests: passed; [command](test-command.txt), [raw output](focused-tests.txt).
  New checks run the emitted guest with real official AppBridge, including
  handshake, state, follow-up, links, invalid/oversized values and foreign-window
  rejection. VM string/wasm code generation is disabled, matching the no-eval
  boundary. This verifies protocol behavior, not browser rendering.
- The small icon bundle has exactly four names and identical official node data;
  unknown dynamic names retain compatibility and failed loads cannot self-retry
  through their own script-removal observer events.
- Full `npm run build` (Web typecheck, pinned source verification, runtime and SPA
  build), server typecheck, Web/server lint: passed. Web has existing lint warnings.
- All 14 emitted public assets match their full SHA-256 URL and server source bytes.
- Derived dependency consistency and affected fixture typecheck: passed. Command:
  `node_modules/.bin/tsc --noEmit --target es2022 --module esnext --moduleResolution bundler --strict --skipLibCheck --types node e2e/visualize/fixture-api.ts e2e/visualize/performance.e2e.ts`.
- First draft's 32-test raw record is retained in [focused-tests-v1.txt](focused-tests-v1.txt).
  Its exact-head [scoped CI](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40456352460)
  and [controller checks](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40456352573)
  passed. Updated exact-head CI is tracked on the draft PR.
- The earlier full `test:e2e:typecheck` failed outside Visualize (react-delivery
  browser-evaluate JSON types and chat-runtime `@/` resolution). Those unrelated
  sources were not changed or repaired; the affected fixture sources pass.

## Unmeasured acceptance and manual method

Cloud browser verification was explicitly waived. No production write, load
experiment, merge or deployment ran. Real paint, first clipboard use, browser
cross-refresh cache hits and interaction timings remain unmeasured. Final
independent review stays with the parent integrator; no review task tree added.

For later human verification use matching production builds/device/network and
saved authorized content on both revisions. Separate generation/save/delivery;
start timing only when the authorized reference is available. With DevTools
Disable cache off, record cold open, normal refresh, second card and three-card
history. Capture actual SVG/canvas visibility and a real control result, not MCP
ready alone. Keep raw samples, transfer/decompressed bytes, long tasks and iframe
initializations. Check that normal refresh does not transfer same-hash public
bodies while HTML/state still authorize. Exercise tabs, tooltip focus/touch,
carousel, known/unknown dynamic icons, D3/calendar, clipboard and failed-load
retry. Existing official `e2e.visualize-377.config.ts`, startup/first-card/offscreen
fixtures remain available. Their dev-server timings are not production evidence.

Rollback: revert this product adaptation/build change as a unit, preserving
retained static assets for already-open frames/old clients. No database migration
or mutable document conversion is involved. Deployment stays with the designated
parent integrator. Capture loading follows the HTML standard's
[modulepreload/module-map behavior](https://html.spec.whatwg.org/multipage/links.html#link-type-modulepreload).
