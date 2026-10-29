# ZCode Web host adaptations

Upstream: zai-org/ZCode `0a1fc56d279fd1001f78387bd81aec1c26767411`.
The original files and licensing are retained under `third_party/zcode/upstream`; the 24-file skill is byte-for-byte unchanged under `third_party/zcode/skills/visualize`.

`zcode/gen-ui` retains the original card, Dialog, Tweak panel, reference parser, Tweak registry, retained page and page-capacity manager. `zcode/components/ui` retains the upstream button, Dialog and textarea. The dependency closure includes the original assistant directive parser, shared schemas, theme projection, message-port transport, page plane and the Chinese/English messages (the unsupported-desktop message is intentionally adapted to browser-capability wording). Imports point at this isolated module; native message rendering remains in LingxiLoop's assistant-ui shell. The upstream `escape` local is renamed and one any-character regex is written as `[\s\S]` for repository lint, with identical semantics.

The Web-specific code is in `web/`, the `useGenUi` hook and narrowly marked page/plane call sites:

- Browser `iframe sandbox="allow-scripts"` replaces Electron webview. A trusted opaque outer shell gives its opaque `srcdoc` guest the same static-resource allowlist and `frame-src 'none'`; this ancestor policy blocks self-navigation without changing the app's global security configuration. Generated HTML only enters the inner guest. Neither frame receives same-origin, top-navigation, popup, form or download permissions.
- The original runtime bundle and Tweak runtime are compiled outside the skill. The host fetches each fixed asset through the page-authorized resource endpoint, assembles upstream styles/runtime/author/inner-kit ordering, and preserves vendor versions, calendar activation and the five-pixel screenshot gutter. Bridge traffic remains the original MCP App protocol; only state, follow-up, external links, private Tweak and presentation methods are registered.
- #213/#217: matched vendor downloads run concurrently while replacement and script execution order stay unchanged. The inline card clips its background with the existing 12px radius using `overflow:clip` (no additional scroll container); its existing hover/focus/touch toolbar is inset at the top right. The expanded toolbar is unchanged. The Web plane exposes DOM layout visibility to the official SDK's existing size callback: parked `display:none` documents cannot replace a retained height with their gutter-only measurement, while offscreen flow documents still resize normally. No protocol, runtime asset, capacity or authorization change accompanies these adaptations.
- Inline save/hosting retains the upstream service's 5,000,000-byte fragment bound. Standalone export retains the original `render.py` input limit of 1,000,000 bytes; the adapter rejects larger fragments and the tool tells the model to simplify them first. The original exporter and 24-file skill remain unchanged.
- A first classic bootstrap captures a closure-private MessagePort and native event methods before author code runs. Only trusted pointer/keyboard events on that channel grant a short-lived, one-use gesture. An author-controlled public message cannot mint a gesture. Host buttons use browser activation, and the upstream follow-up confirmation remains available. Requests check active page, user, company, project, session and server page revision before affecting state or actions.
- Native browser state-preserving `moveBefore` and the original popover preview preserve the same iframe DOM during expand/collapse and conversation changes. Unsupported browsers show a capability error. Upstream capacity limits and five-minute idle suspension remain. Logout, workspace changes and revoked conversation access release retained owners; remote revocation failures are retried separately from local disposal so retries remain possible.
- PostgreSQL state responses include a monotonic revision. Initial preparation is followed by a fresh authorized state read; lower revisions never overwrite newer state. Same-document views synchronize locally, other tabs broadcast only invalidations and refetch, and visible pages revalidate every ten seconds or on focus/reconnection. Follow-up retries retain the original idempotency key after an uncertain response.
- #244 bounds the whole initialization attempt (document, authorized page/resources, fresh state, official SDK ready) to 15 seconds. Abort and disposal make the attempt terminal; late completions cannot mount or restore ready. Local release does not await remote DELETE: the existing scoped revocation queue uses bounded, deduplicated attempts. Each acquisition uses an independent existing instance key while retained DOM identity stays stable, so a late server transaction cannot revoke its successful retry. Cancellation with a lost POST response cannot prove remote revocation; unknown pages occupy the unchanged quota until the existing 24h expiry. The resource-prefetch experiment was rejected after mixed/regressive short measurements; document assembly and resource ordering remain unchanged.
- The #244 normal-startup follow-up defers a cold retained owner's first controller until its existing native IntersectionObserver reports a visible anchor. Visibility is rechecked after release/reservation waits; ready retained controllers still bind immediately, preserve state and receive offscreen size notifications. This avoids preparing every offscreen history card before the observer's first callback. No resource cache, guest runtime, protocol or authorization change is involved.
- Clipboard writing starts synchronously from the host button with a PNG Promise. The guest rasterizes its current DOM at the actual device pixel ratio, then crops the original gutter. The host checks PNG signature, IHDR dimensions, expected DPR dimensions and byte/pixel bounds before fulfilling the clipboard Promise. DOM rasterization is a browser replacement for Electron native capture; exact canvas/font/filter parity needs the independent screenshot acceptance evidence and must not be assumed from shared component source.
- Upstream theme declarations are scoped to `.zcode-visualize`, including portaled Dialog content. Scoped upstream radius/font-feature defaults, text/border inheritance, focus rules, control-font `revert-layer` and Textarea reset isolation restore the original utility cascade inside the host. The host's dark/light mode selects the original Web Zai palette; both declaration blocks are byte-identical apart from their scoped selectors. The existing chat page palette/layout and assistant-ui runtime remain intact. Text splitting preserves original citation coordinates and excludes streaming, malformed and code-fenced references.

Historical acceptance fixtures and upstream comparisons are preserved in Git history before issue #551. Current verification uses the retained integration and release checks.


The upstream `components/lib/utils.ts` class merger is also retained verbatim as
`zcode/lib/utils.ts`. Its `text-ui-*` font-size registration prevents color
utilities from being removed as conflicts. Feature-scoped preflight restores the
upstream default text/border inheritance and rolls back the host's unlayered
control font reset, allowing original utilities to retain their cascade priority.


Source evidence snapshot: **2026-10-19T13:25:21+00:00** at Git HEAD
`54075c1af031172f768a1894c8bd29a5ce74e98f` plus uncommitted changes.
The [source comparison](../../../../docs/evidence/issue-193/frontend-source-diff.json)
records **34 paired files (12 byte-identical, 22 adapted)** and **21 additional
fingerprints**, covering all **42 frontend TypeScript/CSS files** at capture.
The new local class merger is one of the byte-identical pairs; Button, Dialog and
Textarea only redirect their merger import, with Dialog retaining its documented
portal/i18n adaptation. `zcode.css` is separately compared with the complete
upstream stylesheet and is deliberately a scoped extraction rather than an exact
copy. The source comparison totals (152 added / 2,069 removed paired-file lines)
are not a claim of visual parity or missing-feature counts.

The immutable-asset verifier passed **223 manifest files** (24 skill, 197 archived
source, one external runtime, one root license), with the pinned 24-file skill Git
tree, four runtime entries and four vendor/license pairs unchanged. Seven retained
license files and the generated runtime's 157 build-input hashes are also recorded
and verified. See the [port review](https://github.com/LingXi-Org/LingxiLoop/blob/351e895a315bb46b9061c8628b20d9b9fa5ffa1e/docs/evidence/issue-193/FRONTEND-PORT-REVIEW.md)
for the behavior matrix and remaining browser-specific acceptance boundaries.
This final requested source snapshot includes the frozen Web theme correction and
the 4,000-character observation-range prompt (2,000-character retry if truncated).
It is stable during capture, not a browser or production acceptance claim. Later
source changes must be rehashed. The two final archive additions are the original
Web index.html and useTheme.ts; historical verifier runs reporting 221 files remain
accurate for their earlier inventory.

### Web entry theme inheritance correction

The acceptance target is the pinned upstream **Web** host. Its
`packages/web/index.html:119–132` supplies body foreground from
`--color-foreground`; `packages/ui/src/useTheme.ts:22–25,49,59–69` normalizes
light/dark to `zai-light`/`zai-dark`, toggles the theme classes and sets the browser
color scheme. `packages/ui/src/styles.css:513–840` defines the two Zai palettes.
A bare component harness without those entry inputs incorrectly rendered bare
fieldset text black in dark mode. Earlier zero-pixel comparisons against that
harness do not establish parity with the real Web entry.

The correction copies both pinned Zai declaration blocks into feature-scoped
selectors, restores semantic foreground at the base layer (so explicit utility
colors retain priority), and sets color-scheme locally. Lingxi's document/root
classes, chat palette and other controls remain unchanged. The independent
upstream harness must supply the same Web entry inputs and rerun both themes.

The same Web entry (lines 122–127) supplies host UI typography as
`Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`; no intervening
chat-card ancestor overrides it in the pinned source. This font family is
therefore restored on the feature scope. The distinct upstream `--font-sans`
token remains unchanged for guest theme projection. Fixed fixture font packages
are shared environment inputs; they must not replace the entry's font stack.

### #373 host learning actions

The existing Web adaptation now adds a host question button/dialog and accepted
question/change receipts. `GenUiPage.sendFollowUp` delegates to its original
scoped, gesture-checked follow-up; retained owners forward that method. The
question draft uses the shared bounded account/company/course/conversation/source
cache, never automatic replay, and clears only after an accepted receipt. Closing
the question returns focus to its inline or expanded opener. Original-settings
preview remains a Tweak comparison, distinct from document version history.

These host toolbar/receipt additions deliberately differ from the pinned upstream
presentation. Historical source comparison/pixel counts above remain dated
snapshots; they are not current parity claims. No upstream asset, guest permission,
CSP or service protocol is changed. See `docs/evidence/issue-373/learning.md` for
actual checks and the nested-frame locator boundary of the existing CDP browser.

The #373 state/save regression also exposed a compatibility boundary: the
installed AppBridge's `setHostContext` sends partial diffs, while this pinned
GenUI consumer clears missing annotation. `publishGenUiContext` sends complete
current snapshots using the public `sendHostContextChange` method, retaining
Tweak state across unrelated widget-state/theme updates. Bridge construction
still receives the initial context for the handshake. The real-SDK regression
reproduces the former loss; final browser replay is tracked separately.

Tweak submission ownership now lives in the retained page snapshot rather than
remountable panel-local state. Pending/accepted value fingerprints survive panel
toggle, preview movement and retained-owner reacquisition; unchanged accepted
submission is a core no-op. Actual changed values clear the accepted stamp, and
forced suspension marks an in-flight result unconfirmed. A public display-mode
handler reports the current host mode without changing it on guest request;
new pages construct a new bridge with current initial context.
