# Question index acceptance (#145)

Failure cases to exercise before release:

- Assistant/tool/system messages accidentally become questions; attachment-only or long questions have unusable previews.
- Index entries use array positions and jump to the wrong message after older history, receipt reconciliation, or conversation switching.
- Streaming or a new run pulls a history reader to the bottom, including a jump to the latest short question.
- Scroll highlighting uses the whole window instead of the conversation viewport; resizing or growing answers leaves stale selection.
- Older history cannot be reached, a failed request silently does nothing, or prepending messages moves the reading position.
- A long index cannot reach its first/last entry; keyboard focus or preview is clipped; the rail overlaps text/composer at 390px or in dark mode.
- Switching/reloading leaks the prior conversation's entries or reading lock.

Browser acceptance uses tester-army/e2e 0.17.0 and official @e2e-dev/web 0.12.0. The fixture supplies synthetic history at the IM boundary, while using the production converter, transport pagination, store, runtime, thread, messages and composer. It is UI/transport acceptance, not a live IM/backend test.

## Reproduce

From the repository root after `npm ci`:

```sh
npm run test:e2e:install
E2E_TELEMETRY_DISABLED=1 npx --no-install e2e run --config e2e.question-index.config.ts
npx --no-install tsc -p e2e/question-index/tsconfig.json
```

Alternatively, start an isolated Chromium with remote debugging and set `E2E_CDP_URL=http://127.0.0.1:9227`. The engine creates a fresh context per test. The fixture server starts/stops automatically on port 5189. The seven tests cover 1440/390px × light/dark, text/attachment previews, Enter/Space/arrows/Home/End, manual scrolling, streaming, appends and receipt deduplication, conversation switching, reload, pagination failure/retry, anchor preservation and the imported centered waveform with neighbour falloff.

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

See [retained evidence](../../artifacts/question-index/verification.md). Generated browser directories retain full traces locally and are ignored; only synthetic reports and selected screenshots are committed. Stop the dedicated Chromium processes when finished.

## Upstream waveform replacement

Additional failure modes to exercise: the imported Codex waveform loses its Gaussian
falloff/centering; pointer magnification shifts the clicked target; keyboard focus
does not drive the same preview; mobile loses the rail because upstream hides it;
reduced motion leaves waveform transforms animated. Verify source hashes against
`third_party/dsh-turn-scrubber/README.md` and keep the upstream MIT notice.
