# Learning experience

Read the affected row before editing. Reuse assistant-ui, Lexical, the native
runtime, official MCP App bridge and existing scoped state. Keep student requests,
authorization, execution and learning evidence distinct.

Paths below are relative to the repository root. Source inspection establishes
ownership; only recorded checks establish observed behavior. The #373 delivery
record identifies which browser paths ran and which remain pending.

| Rule and owner | Correct example | Observable acceptance |
| --- | --- | --- |
| Keep substantive text in `body`, work details in `process`, current decisions in `attention`; use `components/message-presentation.ts`, `NativeMessageContent.tsx` and the single RunActivity entry under `src/features/chat`. | A hint is readable while the tool history stays collapsed. | Stream a reply containing body, tool work and a questionnaire; body remains visible and the current question remains actionable when process is collapsed. |
| Let `ConversationThread.tsx` and the official assistant-ui viewport own reading intent; keep original source/part identities through delivery. | A student selects an earlier derivation while later text arrives; explicit return-to-latest resumes following. | Exercise selection, history prepend, navigation, process expansion and completion; check the selected content/anchor and final source identity. Use existing `first_body_visible`, `body_painted`, `receiveToPaintP95Ms` measurements for performance claims. |
| Use `ComposerLexicalInput.tsx`/`ComposerTriggers.tsx` and `composer-composition.ts` for composition and menus. | Enter confirms a Chinese candidate; a later normal Enter sends, Shift+Enter adds a line. | Record the actual OS/browser/input method; exercise composing/229, end-of-composition, Esc and mention/slash overlap. Synthetic event checks cover guards, not a real input method. |
| Project next actions from durable state in `runtime/conversation-status.ts`, `runtime/harness.ts`, `runtime/recovery.ts` and approval/questionnaire renderers. | Waiting for the student presents the current question; a submitted interaction becomes a receipt. | Reopen the same run/request version and verify one effective pending control; completed/stale interactions expose no second decision. |
| Build approval context from reviewed public business fields in `server/src/agent-runtime/approval-public-view.ts`, `runtime/approval-context.ts` and `ApprovalRequestCard.tsx`. | A teacher sees a presentation outline title, audience and planned page count before deciding; approval means authorization, with execution status separate. | Compare displayed object/scope/change to the authorized preview and final operation receipt. For options, verify the installed formal runtime API before enabling submission. |
| Recover drafts through the existing `src/features/chat/drafts.ts` and runtime owner. | Failed send retains the student's original input; uploaded references retain only authorized storage identities. | Reload and switch account/company/course/conversation/thread scopes; verify the correct draft appears, another account's does not, and expired/removed attachments are not claimed recoverable. |
| Keep reconnect, continue and restart separate in `runtime/recovery.ts` and transport. | “刷新进度” observes the original run; a fresh message starts a new request only after the user sends it. | Interrupt delivery, reconnect and repeat the action; inspect stable message/run/request identities and check the original receipt before retrying an unknown result. |
| Render artifacts through existing type owners: MarkdownText, CanvasFrameContent/CanvasDocumentEditor, PresentationViewer and `visualize/zcode/gen-ui`. Preserve `web/host.ts`/`document.ts` scope, CSP, source and gesture checks. | A student saves a topology judgment, previews original settings, asks a question and compares the next delivered version with the prior one. | Run the topology fixture; verify local state, original preview, one accepted question in the same session and prior-page state on return. Independently verify real server ACL/idempotency when changing those boundaries. |
| Send complete context snapshots to the pinned GenUI guest using `gen-ui/adapters/context.ts`; the public SDK's `setHostContext` emits partial diffs. | Saving a student's48-address judgment keeps the current override active; previewing registered original settings then displays32. | The real-SDK regression in `context.test.ts` reproduces partial-state loss and checks complete snapshots. Run the browser topology save/change/original scenario before claiming guest acceptance. |
| Use `GenUiCard.tsx`'s host question dialog for guest-independent continuation and `TweakPanel.tsx` for submitted changes; keep pending/accepted value fingerprints in the retained page snapshot. | “问题已发送，回复将在原会话中继续。” follows accepted transport; uncertainty keeps the question for checking/retry. | Cancel/reopen/refresh use the existing bounded artifact-question draft namespace; switching account/course/source isolates it; unchanged accepted changes remain disabled through panel toggle/expansion; a real click sends; synthetic activation/hidden/stale pages fail. Confirm a failed request retains text and the original idempotency key. An accepted request alone does not prove a generated next version. |
| Preserve student authorship through `ConversationComposer.tsx` and the existing editable input. Keep ordinary, compact, thread and narrow-screen composers free of persistent learning-help shortcuts. | A student writes their attempt and the help they want in the input, retaining quotes and attachments until they choose to send. | Verify no learning-help controls or empty shortcut row remain; multiline input, send/stop, quotes, attachments and the add menu remain reachable. The learning fixture retains manually entered attempts through artifact actions. |
| Use `server/src/modules/learning/homework-help.ts` and `homework-help-state.ts` for a bound homework's help default; `homework-tools.ts` and `agent-runtime/context.ts` load it after authorization. Keep provider configuration in its existing owner. Follow frozen teacher requirements, honor requested explanation and return an independent next step. | One READY assessment with cited student work leaves a criterion open: give a brief clue. Two such assessments of that same criterion with newly cited work: explain with an analogous example. | Run `homework-help*.test.ts`: repeated evidence, stale epochs, unknown/default criteria and unreadable attachments never increase depth; ordinary chat adds no tutoring rule. Verify teacher requirements/feedback, submission state and editable student attempt remain intact. Synthetic context checks establish the selected default; assess actual teaching quality separately. |
| Use existing learning evidence rules in `server/src/modules/learning/homework-effects.ts`, `forum-assessment.ts` and `canvas/evidence.ts`. | Saved student work and independent transfer can be evidence; a generated diagram or successful tool call is an artifact/result. | Verify student-origin message IDs/references and assistance in the persisted record. A rendered view, sent feedback or completed explanation cannot upgrade mastery. |

## Resources and scope

`visualize/web/document.ts` rewrites allowlisted visualization resources to the
page-authorized host; the pinned runtime/assets are versioned and verified by
`scripts/verify-zcode-visualize.mjs`. Markdown/Mermaid/code/math use the installed
renderers rather than an arbitrary runtime CDN. Page acquisition, state saves,
model responses and collaboration require the authorized service connection;
loading a renderer locally does not make these operations offline-capable.

Canvas document revisions use expected revision checks and retain conflicting
drafts; selected-text feedback carries frame/revision provenance. Presentation
versions use their existing selector. GenUI original-settings preview compares
current tweaks with their registered initial values; it is not durable document history.
Represent a delivered new GenUI version with its actual reference/source rather
than an invented revision counter.

## Applied example and evidence

#373 adds a small `sendFollowUp` facade to the retained GenUiPage and delegates to
the existing guarded `followUp` operation. The isolated context publisher supplies complete snapshots to the pinned guest,
which consumes missing annotation as cleared state. The host card's editable question
dialog provides continuation even when the generated guest has no question
button. It keeps request text in the existing scoped V2 cache after an unconfirmed response, never automatically resends a restored draft, and reports accepted
delivery separately from later results. `TweakPanel` reports accepted changes.
At the historical #373 delivery, the composer added three editable help intents
using its public API. #446 retires those persistent shortcuts and their helper
components; students express the help they want in the existing editable input.

`e2e/visualize/learning.e2e.ts` uses production card/page/SDK and resizable
primitives with synthetic public course content and deterministic local API.
The second authored-version reference is a fixture input, not evidence of model
generation. Actual command/outcome/environment and remaining gates belong in
`docs/evidence/issue-373/learning.md` after execution. Use this task as a discovery
replay: follow AGENTS → assistant-ui → this row → the owning file, and verify the
requested acceptance before claiming completion.

See [surface rules](../../better-layout/references/learning-surfaces.md) and
[fixed source/reuse map](issue-373-sources.md).

## #373 observed reference points

The visual owner recorded 33 focused tests and official before/after synthetic
browser passes in `docs/evidence/issue-373/visual-input/README.md`: the baseline229
path sent once; the guarded path sent zero times, with immediate normal Enter,
menus and original body-node identity retained. Selected text remained unchanged
with 16px native-anchor displacement (less than one 27.2px line). Preserve that
explicit bound; physical IME, async-height/pagination and settled dark-color
acceptance remain separate. Small warm dev first-body observations (152.0ms
baseline/110.9ms after, one/two paint samples) are measurements, not a causal
performance improvement claim.

The state owner recorded 37 focused tests, source typechecks and reviewed public
preview mapping in `docs/evidence/issue-373/state-recovery.md`. All six actual
approval producers are binary and installed LingxiOS3.8.11 accepts boolean
decisions. Keep historical option-bearing records explicit until a real producer
and supported formal contract exist. Separate pending/granted/executed/failed/
unknown receipts and use the common bounded cache for composer, questionnaire
and artifact questions. Browser evidence for those surfaces is tracked by the
state owner; do not infer it from source tests.

Learning's actual test environment, accepted draft-scope/browser observations,
failure history and unfinished acceptance belong in
`docs/evidence/issue-373/learning.md`. A standalone authored topology fixture does
not establish model-generated revision, server tenancy or mastery.

The learning owner recorded a passing real-card draft browser scenario (refresh,
actual account isolation, no auto resend, receipt clearing) and the reviewed
15.97s topology replay in `docs/evidence/issue-373/learning.md`: six actual guest
SDK state saves, original/current32↔48, keyboard separator40→45, stable accepted
tweak receipt through panel remount, question focus/gesture checks and authored
reference roundtrip. Five focused regressions, typechecks and independent review
also passed. The final question-receipt placement delta was source/lint checked;
server tenancy, live model revision, actual homework submission and mastery are
outside this deterministic browser fixture.
