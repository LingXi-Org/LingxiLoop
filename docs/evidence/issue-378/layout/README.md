# #378 layout and trace work

Base: 7ada8fdd5addd1acd681b63bcca1e42bab320493. This branch owns F/G and per-part presentation, separate from B/C and D/E.

Failure model: the question index currently queries and measures every historical question on each viewport/content resize or scroll frame. The trace's 100ms timer runs while its nested details are closed. Each PartFrame independently classifies the entire message to place its footer. These are source-established costs, not measured user FPS.

Keep the original viewport/rAF, reading-line and bottom semantics, authorized trace, public body/process/attention classification, stable part/source keys, and current history/error/approval behavior. Cache question element registration, not geometry across layout changes. Share classification within one message render; do not cache by IDs/length or skip semantic changes. The inner details, offscreen and page-visibility clock gates leave the trace mounted and preserve selection/filter state. The outer BaseUI disclosure keeps its existing unmount behavior; this change makes no new retention promise for closing that outer panel.

Four backdrop blur layers and existing avatar animation remain unchanged: no trace establishes them as the current bottleneck. Browser geometry/iframe identity and performance measurement remain pending until a serial slot is available. No provider or production actions.

## Local verification

Node 22.23.3, existing symlinked dependencies; no install. Eight affected files passed 46/46 tests, then final helper disposal/missing-node fallback delta passed 3/3 and the disclosure context suite passed 6/6 (one additional case, 47 distinct total). The tests include current approval/request-version/error visibility and trace terminal/currency semantics. Valid failures and fixture mistakes remain separately recorded.

| Equivalent synthetic input | Before | After |
| --- | --- | --- |
| 10,000 vertically ordered questions, tail viewport | 10,000 rectangle reads | 15 rectangle reads, identical active/visible indices |
| Actual ConversationMessage SSR, 80 text parts | 81 whole-message classifications | 1, with 80 rendered parts and one footer |
| Clock lifecycle | Starts while disclosure disabled | No periodic timer when closed, offscreen, document hidden or disposed; immediate current-time update when visible |

These are operation counts and deterministic lifecycle checks, not FPS, CPU duration, layout/paint or device measurements. Question geometry is discarded each frame, so earlier image/Markdown reflow is measured again; only element identity is retained. Missing roots preserve the original first-question/bottom fallback. New/replaced question roots invalidate registration through the existing viewport's DOM subtree. The official assistant-ui runtime remains the message owner; classification memo depends on the complete message snapshot, not an ID/length approximation. Original body keys, source identity, permission and error handling are unchanged.

The existing assistant-ui Elements disclosure and Langfuse bar rendering retain their pinned MIT attribution in `third_party/assistant-ui-elements/README.md` and `src/components/trace-waterfall/NOTICE.md`. Local changes add an open-state context and native IntersectionObserver/document-visibility lifecycle to the existing elapsed timer; they introduce no runtime store, scroll controller or package.

Targeted lint passed. The allowed 768MiB full web typecheck exhausted V8 heap (exit134); this is retained, not reported as a typecheck pass. Exact candidate CI and browser verification remain pending. No arbitrary DOM render skip, blur removal, avatar change, text truncation, or provider call was used to meet a target.

Exact source CI 40071942433 passed lint and all 129 web tests, then reported TS2352 in the synthetic IntersectionObserverEntry fixture (missing unused DOMRect fields). The test now supplies the complete entry shape; runtime code and assertions are unchanged. The isolated clock test passed again. The prior CI failure remains recorded; the next exact-head result is required.

## Browser and exact CI

Source 42d889f85600a6b192b139134821e6f4e8b5e092 passed exact CI40072188279 (including full web typecheck/build and 129 tests). Independent review of source9283b48f, the two-file42d delta, and fixture75570e8a found no remaining P1/P2. The final evidence commit still requires its own exact CI.

The official @e2e-dev/web Chromium runner used the batch's existing CDP9337, with security/profile unchanged, against a single-entry production build (2048MiB V8 limit;59.39s; no public directory copy or sourcemaps). Fixture source75570e8afdd274032f4c3809b5a00b003d8efabb was committed/clean. Run01a16cb7-7741-70db-b369-f48d8d9b26f6 passed1/1 in7.82s (total9.47s). Preview5196 exited normally; no provider/network backend call occurred.

Observed:256 user questions,20 tail updates,21 question rectangle reads per update/420 total, zero question queries during tail growth; exact selected `Question 128` and active reading choice retained. Fresh geometry after earlier-height reflow,257-question prepend and first/last navigation passed. The synthetic same-source/version iframe node/window survived all updates and prepend, with0 reloads. The actual nested trace remained the same node and retained its filter;350ms windows showed no elapsed-text changes when closed/offscreen/reclosed, and changes while open/returned. The page-hidden/disposal boundaries are deterministic unit coverage, not this browser observation. No FPS, receive-to-paint target or absolute timing improvement is inferred.

First run01a16cb4-ef70-77f0-afc8-63a7faa22c1f failed the final iframe check after prepend: the fixture initially used upstream `ThreadPrimitive.Messages` (index keys), while the product's ConversationThread already uses stable-keyed MessageByIndex. Tail-update iframe identity had passed. The fixture was corrected to the product's identity boundary; no product change or assertion relaxation was made. The original failed report/log and local failure screenshot remain preserved. The iframe is a synthetic descendant of the real NativeMessageContent/PartFrame, not an authenticated GenUI bridge qualification.

Build inventory and source hashes are in browser-build-evidence.json; browser-report.json and browser-final.png contain the recorded result. Blur layers, avatars, viewport ownership, runtime/source/approval rules and the public source/classification algorithm remain unchanged.
