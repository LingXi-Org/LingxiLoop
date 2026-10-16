# Question index acceptance (#145)

Failure cases to exercise before release:

- Assistant/tool/system messages accidentally become questions; attachment-only or long questions have unusable previews.
- Index entries use array positions and jump to the wrong message after older history, receipt reconciliation, or conversation switching.
- Streaming or a new run pulls a history reader to the bottom, including a jump to the latest short question.
- Scroll highlighting uses the whole window instead of the conversation viewport; resizing or growing answers leaves stale selection.
- Older history cannot be reached, a failed request silently does nothing, or prepending messages moves the reading position.
- A long index cannot reach its first/last entry; keyboard focus or preview is clipped; the desktop rail overlaps text/composer, or remains present on mobile.
- Switching/reloading leaks the prior conversation's entries or reading lock.

Browser acceptance uses tester-army/e2e 0.17.0 and official @e2e-dev/web 0.12.0. The fixture supplies synthetic history at the IM boundary, while using the production converter, transport pagination, store, runtime, thread, messages and composer. It is UI/transport acceptance, not a live IM/backend test.

## Reproduce

From the repository root after `npm ci`:

```sh
npm run test:e2e:install
E2E_TELEMETRY_DISABLED=1 npx --no-install e2e run --config e2e.question-index.config.ts
npx --no-install tsc -p e2e/question-index/tsconfig.json
```

Start an isolated Chromium with remote debugging and a desktop pointer profile, then set `E2E_CDP_URL=http://127.0.0.1:9227`. For example:

```sh
chromium --headless --no-sandbox --disable-dev-shm-usage \
  --blink-settings=availableHoverTypes=2,availablePointerTypes=4,primaryHoverType=2,primaryPointerType=4 \
  --remote-debugging-address=127.0.0.1 --remote-debugging-port=9227 \
  --user-data-dir=/tmp/lingxiloop-official-map --no-first-run about:blank
```

The desktop test asserts native `matchMedia('(hover: hover)')` before checking
hover magnification. This cloud Chromium otherwise reports no pointer; do not
patch upstream CSS to work around a test-device capability. The engine creates a fresh context per test. The fixture server starts/stops automatically on port 5189. The browser cases cover desktop interactions at 1440px in light/dark themes, mobile omission at 390px in both themes, text/attachment previews, Enter/Space/arrows/Home/End, manual scrolling, streaming, appends and receipt deduplication, conversation switching, reload, pagination failure/retry, anchor preservation and the complete official assistant-ui Conversation Map and its tiered hover appearance.

Reduced-motion verification needs a dedicated Chromium endpoint. In a separate terminal:

```sh
chromium --headless --no-sandbox --disable-dev-shm-usage --remote-debugging-address=127.0.0.1 --remote-debugging-port=9228 --user-data-dir=/tmp/lingxiloop-question-index-motion --no-first-run about:blank
```

Then:

```sh
E2E_CDP_URL=http://127.0.0.1:9228 E2E_REDUCED_MOTION=1 E2E_TELEMETRY_DISABLED=1 npx --no-install e2e run --config e2e.question-index.config.ts --grep 'reduced motion' --output artifacts/question-index/reduced-motion
```

`media.ts` sets the actual Chromium `prefers-reduced-motion` preference through CDP because engine 0.12.0 has no media option. The test confirms native `matchMedia`, immediate positioning and visible focus. All browser interactions, assertions, navigation and screenshots use the official engine; no Playwright API is imported or called.

The existing desktop/mobile shell regression also checks canvas placement and the composer boundary:

```sh
E2E_TELEMETRY_DISABLED=1 npx --no-install e2e run --config e2e.visual.config.ts --grep 'chat order, delivery' --output .e2e/question-index-shell
```

See [official replacement evidence](../../artifacts/question-index/official-map/verification.md) and [historical evidence](../../artifacts/question-index/verification.md). Generated browser directories retain full traces locally and are ignored; only synthetic reports and selected screenshots are committed. Stop the dedicated Chromium processes when finished.

## Official source replacement and dense-history regression

The product imports the complete official standalone Conversation Map through its
public props. Both official component variants and their local dependency files
are retained unchanged; verify the checksums and provenance in
`third_party/assistant-ui-conversation-map/README.md`.

Before replacement, the old implementation failed all three spacing cases:
8 turns had overlapping hit areas; 320 turns had overlapping visible bars on both
desktop and mobile. The replacement tests retain desktop spacing cases; mobile now verifies complete omission. Desktop cases verify
separated rows, visible gaps, fixed vertical positions during hover, first/last
keyboard navigation, portal preview visibility and active-marker visibility.
The official interaction uses hovered/current/visible tiers, not Gaussian
magnification. Selectors now use the official data slots and accessible labels;
no test-only attributes are patched into the upstream component.

The fixture accepts `?turns=8` or `?turns=320` for repeatable short and dense
histories. Screenshots and report JSON are saved by the official E2E engine.

Both theme cases verify that the active bar renders the existing primary green
brand color at the official opacity. Dense cases also verify that a wheel scroll
in the index does not move the transcript, and reading position brings the
corresponding index entry into view.

## Mobile visibility

The final requirement hides the entire index below the app's existing 768px
mobile breakpoint. Failure cases: a reserved empty gutter remains, hidden ticks
stay keyboard-focusable, a portalled preview survives resizing, or the index
fails to return at desktop width. `responsive.e2e.ts` covers 390px in both themes
with 320 turns and the exact 767/768px transition with a preview open. The host
uses the existing `useIsMobile` hook to unmount the complete official component;
no upstream code is altered.
