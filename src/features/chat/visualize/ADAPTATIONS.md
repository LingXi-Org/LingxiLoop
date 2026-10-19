# ZCode Web host adaptations

Upstream: zai-org/ZCode `0a1fc56d279fd1001f78387bd81aec1c26767411`.
The original files and licensing are retained under `third_party/zcode/upstream`; the 24-file skill is byte-for-byte unchanged under `third_party/zcode/skills/visualize`.

`zcode/gen-ui` retains the original card, Dialog, Tweak panel, reference parser, Tweak registry, retained page and page-capacity manager. `zcode/components/ui` retains the upstream button, Dialog and textarea. The dependency closure includes the original assistant directive parser, shared schemas, theme projection, message-port transport, page plane and the Chinese/English messages (the unsupported-desktop message is intentionally adapted to browser-capability wording). Imports point at this isolated module; native message rendering remains in LingxiLoop's assistant-ui shell. The upstream `escape` local is renamed and one any-character regex is written as `[\s\S]` for repository lint, with identical semantics.

The Web-specific code is in `web/`, the `useGenUi` hook and narrowly marked page/plane call sites:

- Browser `iframe sandbox="allow-scripts"` replaces Electron webview. A trusted opaque outer shell gives its opaque `srcdoc` guest the same static-resource allowlist and `frame-src 'none'`; this ancestor policy blocks self-navigation without changing the app's global security configuration. Generated HTML only enters the inner guest. Neither frame receives same-origin, top-navigation, popup, form or download permissions.
- The original runtime bundle and Tweak runtime are compiled outside the skill. The host fetches each fixed asset through the page-authorized resource endpoint, assembles upstream styles/runtime/author/inner-kit ordering, and preserves vendor versions, calendar activation and the five-pixel screenshot gutter. Bridge traffic remains the original MCP App protocol; only state, follow-up, external links, private Tweak and presentation methods are registered.
- A first classic bootstrap captures a closure-private MessagePort and native event methods before author code runs. Only trusted pointer/keyboard events on that channel grant a short-lived, one-use gesture. An author-controlled public message cannot mint a gesture. Host buttons use browser activation, and the upstream follow-up confirmation remains available. Requests check active page, user, company, project, session and server page revision before affecting state or actions.
- Native browser state-preserving `moveBefore` and the original popover preview preserve the same iframe DOM during expand/collapse and conversation changes. Unsupported browsers show a capability error. Upstream capacity limits and five-minute idle suspension remain. Logout, workspace changes and revoked conversation access release retained owners; remote revocation failures are retried separately from local disposal so retries remain possible.
- PostgreSQL state responses include a monotonic revision. Initial preparation is followed by a fresh authorized state read; lower revisions never overwrite newer state. Same-document views synchronize locally, other tabs broadcast only invalidations and refetch, and visible pages revalidate every ten seconds or on focus/reconnection. Follow-up retries retain the original idempotency key after an uncertain response.
- Clipboard writing starts synchronously from the host button with a PNG Promise. The guest rasterizes its current DOM at the actual device pixel ratio, then crops the original gutter. The host checks PNG signature, IHDR dimensions, expected DPR dimensions and byte/pixel bounds before fulfilling the clipboard Promise. DOM rasterization is a browser replacement for Electron native capture; exact canvas/font/filter parity needs the independent screenshot acceptance evidence and must not be assumed from shared component source.
- Upstream theme declarations are scoped to `.zcode-visualize`, including portaled Dialog content. Scoped upstream radius/font-feature defaults, text/border inheritance, focus rules, control-font `revert-layer` and Textarea reset isolation restore the original utility cascade inside the host. The host's dark mode selects the upstream dark palette. The existing chat page palette/layout and assistant-ui runtime remain intact. Text splitting preserves original citation coordinates and excludes streaming, malformed and code-fenced references.

Executable acceptance fixtures and independent upstream comparison live under `e2e/visualize`; check the evidence report for actually completed coverage. No production deployment or Electron packaging is part of this adaptation.


The upstream `components/lib/utils.ts` class merger is also retained verbatim as
`zcode/lib/utils.ts`. Its `text-ui-*` font-size registration prevents color
utilities from being removed as conflicts. Feature-scoped preflight restores the
upstream default text/border inheritance and rolls back the host's unlayered
control font reset, allowing original utilities to retain their cascade priority.


Source evidence snapshot: **2026-10-19T12:44:34+00:00** at Git HEAD
`5554c0f3c21ba3350e78ed6076e639ad0124645a` plus uncommitted changes.
The [source comparison](../../../../docs/evidence/issue-193/frontend-source-diff.json)
records **34 paired files (12 byte-identical, 22 adapted)** and **21 additional
fingerprints**, covering all **42 frontend TypeScript/CSS files** at capture.
The new local class merger is one of the byte-identical pairs; Button, Dialog and
Textarea only redirect their merger import, with Dialog retaining its documented
portal/i18n adaptation. `zcode.css` is separately compared with the complete
upstream stylesheet and is deliberately a scoped extraction rather than an exact
copy. The source comparison totals (152 added / 2,069 removed paired-file lines)
are not a claim of visual parity or missing-feature counts.

The immutable-asset verifier passed **221 manifest files** (24 skill, 195 archived
source, one external runtime, one root license), with the pinned 24-file skill Git
tree, four runtime entries and four vendor/license pairs unchanged. Seven retained
license files and the generated runtime's 157 build-input hashes are also recorded
and verified. See the [port review](../../../../docs/evidence/issue-193/FRONTEND-PORT-REVIEW.md)
for the behavior matrix and remaining browser-specific acceptance boundaries.
Frontend/runtime edits are still ongoing: these statistics describe the recorded
working tree only, and later deltas must be rehashed before final acceptance.
