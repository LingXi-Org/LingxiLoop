# Durable case covers: QuickJS candidate

This supersedes the earlier Chromium/user-namespace acceptance blocker for the
cover implementation. The original failed sandbox and model attempts remain
part of the record. Native Visualize's existing bubblewrap dependency is retained;
this feature does not install Chromium, disable a sandbox, alter sysctls, or run
model JavaScript in Node or the host DOM.

## Reused implementation and boundary

- Hairline: original kernel, full template, validators, guidance and two examples
  at `lucasmarkes/hairline@37d2e78dcb333ab30c3338e28ed4a690364ea014`.
  The unchanged vendored files, MIT license and per-file manifest are retained.
  The full original template is assembled and syntax-validated for provenance.
- Execution engine: official `quickjs-emscripten-core` and
  `@jitl/quickjs-wasmfile-release-sync` 0.32.0, exact root/server lock integrities,
  plus official `@jitl/quickjs-ffi-types` 0.32.0. WASM SHA-256 is
  `105c3bed22d457e43e3d1c3c1c6959fda62a8fe06f0fc8a985303c3a2be72232`.
  The published browser loader is used on both platforms, without its Node
  filesystem/module shims. The distributed licenses are in THIRD_PARTY_NOTICES.
- Product adapter: a closed VM-only SVG/clock/pointer interface, with strict V2
  program JSON. Primitive bounded frame strings cross the boundary; validated
  SVG is painted as an image. The guest receives no host callbacks, module
  loader, browser DOM, network, filesystem or credentials. Legacy HTML is rejected.
  Worker termination is an additional limit, not a claim of an OS sandbox or
  immunity to an engine defect.
- Limits: 8 MiB QuickJS heap, 256 KiB stack, 64 MiB WASM memory, one shared 500ms
  initialization allowance, 100ms per interaction step, bounded output/nodes,
  one in-flight/coalesced request, and external Worker deadlines. Retained
  geometry, class, attribute and reference whitelists also apply to the first frame.

## Actual fixed-program checks

The fixed `verify-runtime.mjs` SHA-256 remained
`8bd2e226568708e00e7cea0caee5f98caa2a0c3f7099b100d78c57d4a9dc5995`.
It ran within the approved 20-second / Node 256 MiB outer limits, with a cleared
child environment. The first real runs exposed and led to fixes for primitive
string length copying, Terrain's owned-node `after()` ordering, and an overly
small initialization deadline. These failures were retained.

The corrected candidate passed all eight checks: original Riffle and Terrain
first frames plus changed geometry under pointer input; CPU bound, heap bound,
external SVG rejection, oversized output rejection, module-loader rejection and
absence of host APIs. Riffle SVG was 27,423 bytes and Terrain SVG 58,116 bytes.
The script's historical `nodes` output is JSON string length, not a DOM node count.
These two figures are compatibility coverage, not an assertion that arbitrary
upstream browser programs are supported.

## Real provider and persistence

Only a synthetic, actually saved local article was used. The configured model
was `deepseek-ai/DeepSeek-V4.1-Flash` at the existing SiliconFlow origin through
the product's normal tracked client. The first proposal needed a bounded repair;
the second proposal exposed a missing VM `classList.add` operation. Both failures
were preserved, the VM API was fixed, and safe fixed error categories now retain
failure stage without copying guest exceptions or source into logs.

Two actual paid requests consumed 27,792 input and 4,221 output tokens, estimated
CNY 0.089352 by the real versioned ledger (`siliconflow-cn-2026-10-22`). There was
no judge call. Reusing the already paid repaired proposal, a real server Worker
produced the first SVG in 480ms. A subsequent real leased/fenced job attempt
assembled, rendered, sanitized and persisted it as one ready asset, with zero
additional provider requests. This replay is explicit, not a third claimed model
success. The prior failed job attempt and original two ledger entries remain.

All 15 final read-only checks passed: article body/version, fingerprint and
content generation unchanged; exact parsed source/program/preview/original
full-template hashes; one installed target asset; unchanged paid ledger.

- Preview: 7,805 bytes, SHA-256
  `0037d92b5a92d4082e99c7b883f114a09f94f0c71f958e4a698edbcdfa4425b1`.
- Interactive program SHA-256:
  `26da38705bef0237c0b31ce25a1e3e86e1955dbcd2edc576d4f8d6c0abc8375b`.
- No production article was read, modified, generated or used for this test.

## Storage, UI and release

Saving and publishing enqueue independently owned draft/published targets in the
same transaction as the saved snapshot. A real worker owns bounded admission,
lease token, heartbeat, retry and generation fencing, and rechecks management
permission before claim and commit. Completion changes cover metadata rather
than article/version/index state. Old ready previews remain while replacements
run. Historical generation has an authenticated, bounded, resumable operation;
reads never enqueue work.

CasesPage uses the existing hero/grid layout, preserves the manual cover fallback,
and polls only matching content generations. Reduced motion/hidden/offscreen
previews remain static. Interactive Workers are released on scope or lifecycle
changes. The official live browser flow passed (1/1, 4.57s): real API/static SVG, real
WASM first frame, geometry change after native mouse input, native touch input,
explicit stop, real IntersectionObserver hide, scope teardown, history reopen,
and static reduced-motion previews at 300/400px. Three Workers were created and
all terminated; before/after job, asset and paid-call counts were unchanged.
See `browser-summary.json` and the three screenshots. This browser reported
coarse pointer: fine-pointer hover and actual background-tab visibility were not
verified and are explicitly not counted as passing.

The release appends only transactional `0055_case_covers.sql` (SHA-256
`609100abaddceeaba19d363962d6defbfae3276450a2fd660777d7efd4a66160`),
retaining formal LingxiOS 3.8.12 / native14 / control11 / reader3 / producer v3.
The new release profile requires the actual accepted product54 source, audited
immutable image/config/inventories, stopped writers, two zero-lease readings and
zero bound/checkpoint work, then a fresh snapshot with verified isolated restore
before the one migration. Post55 failures require fix-forward; unknown operations
are not replayed. There is no runtime upgrade or old migration replay.

This document records local qualification, not a production rollout receipt.
Production delivery and issue closure require the actual target image, exact CI,
native terminal receipts, four healthy identities and HTTPS/static-asset readback.
