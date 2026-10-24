# #378 layout and trace work

Base: 7ada8fdd5addd1acd681b63bcca1e42bab320493. This branch owns F/G and per-part presentation, separate from B/C and D/E.

Failure model: the question index currently queries and measures every historical question on each viewport/content resize or scroll frame. The trace's 100ms timer runs while its nested details are closed. Each PartFrame independently classifies the entire message to place its footer. These are source-established costs, not measured user FPS.

Keep the original viewport/rAF, reading-line and bottom semantics, authorized trace, public body/process/attention classification, stable part/source keys, and current history/error/approval behavior. Cache question element registration, not geometry across layout changes. Share classification within one message render; do not cache by IDs/length or skip semantic changes. Keep trace mounted and preserve selection/filter state; pause only its elapsed clock while closed/offscreen/page hidden.

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
