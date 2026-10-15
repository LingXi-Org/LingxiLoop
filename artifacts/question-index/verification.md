# Issue #145 — question navigation evidence

Verified 2026-10-15 with the locked dependencies (LingxiOS 3.4.7), tester-army/e2e 0.17.0 and official @e2e-dev/web 0.12.0. No direct Playwright imports or calls.

- [Feature report](browser-report.json): **7 passed**, 0 failed/skipped; 1440/390px × light/dark, text and attachment previews, keyboard activation, reading-position tracking, historical pagination and retry, anchor preservation, stream/new-run interruption prevention, appends and receipt deduplication, switching and refresh; imported waveform centering, neighbour magnification and pointer navigation.
- [Reduced-motion report](reduced-motion-report.json): **1 passed**, 0 failed/skipped; native reduced-motion preference, immediate positioning, visible keyboard focus and zero waveform transition duration.
- [Existing shell report](shell-report.json): **2 passed**, 0 failed/skipped; desktop/mobile sidebars, canvas, composer alignment, message delivery and recovery.
- Web lint, typecheck, **87 existing tests**, production build, E2E typecheck and fixture typecheck passed. Lint/build retain existing repository warnings.

[Reproduction commands and fixture boundaries](../../e2e/question-index/README.md). These browser tests use synthetic conversation/IM inputs and production UI/runtime/pagination; they do not claim live backend/LLM coverage. Production deployment is verified separately through the existing CI/CD rollout's Komodo terminal update and public HTTP checks.

The implementation reserves 28px for the rail, includes only user-role messages, uses stable canonical client IDs and exposes earlier history with an explicit retryable loading button. History navigation pauses bottom following until “滚动到底部”. New agent runs no longer force an independent bottom jump. The imported source compresses the full loaded index into a centered waveform and supports arrows/Home/End.

The prior handmade short-bar rendering is replaced with the MIT-licensed
[dsh-turn-scrubber TurnRail source](https://github.com/wsxwj123/dsh-plugins/tree/c92ff6b61461de988cbf152bd2c6273ceb7406cc/packages/dsh-turn-scrubber).
[Provenance, source hashes, license and integration changes](../../third_party/dsh-turn-scrubber/README.md).
The Gaussian magnification and fisheye spacing are imported from that source.
The global host reduced-motion rule required a scoped override so both imported
transitions have exactly zero duration; the browser test verifies this.

## Screenshots

| Evidence | Screenshot |
| --- | --- |
| Upstream hover waveform | [Waveform](screenshots/question-index-upstream-waveform.png) |
| Desktop light preview | [Preview](screenshots/question-index-preview-1440-light.png) |
| Desktop dark reading position | [History](screenshots/question-index-history-1440-dark.png) |
| Mobile light preview | [Preview](screenshots/question-index-preview-390-light.png) |
| Mobile dark, unobscured composer | [History](screenshots/question-index-history-390-dark.png) |
| Oldest loaded question | [History](screenshots/question-index-oldest-history.png) |
| Latest question with keyboard | [Keyboard](screenshots/question-index-latest-keyboard.png) |
| Reduced motion and focus | [Keyboard](screenshots/question-index-reduced-motion-keyboard.png) |
| Existing desktop canvas shell | [Canvas](screenshots/chat-canvas-scrollbar-1440.png) |
| Existing mobile canvas shell | [Canvas](screenshots/chat-canvas-scrollbar-390.png) |

[Validation summary and product source hashes](validation.json). Raw report screenshot locations point into the ignored local run directories; the selected images above are retained with stable names.
