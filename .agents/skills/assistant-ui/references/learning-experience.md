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
| Build approval context from reviewed public business fields in `server/src/agent-runtime/approval-public-view.ts`, `runtime/approval-context.ts` and `ApprovalRequestCard.tsx`. | A teacher sees the homework title and proposed publication before deciding; approval means authorization, with execution status separate. | Compare displayed object/scope/change to the authorized preview and final operation receipt. For options, verify the installed formal runtime API before enabling submission. |
| Recover drafts through the existing `src/features/chat/drafts.ts` and runtime owner. | Failed send retains the student's original input; uploaded references retain only authorized storage identities. | Reload and switch account/company/course/conversation/thread scopes; verify the correct draft appears, another account's does not, and expired/removed attachments are not claimed recoverable. |
| Keep reconnect, continue and restart separate in `runtime/recovery.ts` and transport. | “刷新进度” observes the original run; a fresh message starts a new request only after the user sends it. | Interrupt delivery, reconnect and repeat the action; inspect stable message/run/request identities and check the original receipt before retrying an unknown result. |
| Render artifacts through existing type owners: MarkdownText, CanvasFrameContent/CanvasDocumentEditor, PresentationViewer and `visualize/zcode/gen-ui`. Preserve `web/host.ts`/`document.ts` scope, CSP, source and gesture checks. | A student saves a topology judgment, previews original settings, asks a question and compares the next delivered version with the prior one. | Run the topology fixture; verify local state, original preview, one accepted question in the same session and prior-page state on return. Independently verify real server ACL/idempotency when changing those boundaries. |
| Use `GenUiCard.tsx`'s host question dialog for guest-independent continuation and `TweakPanel.tsx` for submitted changes. | “问题已发送，回复将在原会话中继续。” follows accepted transport; uncertainty keeps the question for checking/retry. | Cancel/reopen preserves text; a real click sends; synthetic activation/hidden/stale pages fail. Confirm a failed request retains text and the original idempotency key. An accepted request alone does not prove a generated next version. |
| Preserve student authorship with `LearningHelpActions.tsx` and `learning-help.ts`; append an editable request to the existing composer. | “检查我的思路” retains “我认为每个子网需要 32 个地址” and asks for the first place to check. | Selecting help neither sends nor clears the attempt/attachments; focus returns to the composer. Verify the request text through `learning-help.test.ts` and the learning fixture. |
| Keep pedagogy separate from provider budget in `server/src/agent-runtime/runtime.ts` and `server/src/llm.ts`. Base help on the learner's request, attempts, misconceptions and teacher requirements; give an initial brief clue, explain more when requested/needed and return an independent next step. | A model can reason thoroughly and return one accurate clue; “解释这个原理” requests an example and a next task. | Inspect the submitted request and unchanged provider configuration. Check the supported model capability before adding any effort option; evaluate response quality with actual learner evidence, not a slider value. |
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
current tweaks with the authored original; it is not durable document history.
Represent a delivered new GenUI version with its actual reference/source rather
than an invented revision counter.

## Applied example and evidence

#373 adds a small `sendFollowUp` facade to the retained GenUiPage and delegates to
the existing guarded `followUp` operation. The host card's editable question
dialog provides continuation even when the generated guest has no question
button. It keeps request text after an unconfirmed response and reports accepted
delivery separately from later results. `TweakPanel` reports accepted changes.
The composer adds three editable help intents using its public API.

`e2e/visualize/learning.e2e.ts` uses production card/page/SDK and resizable
primitives with synthetic public course content and deterministic local API.
The second authored-version reference is a fixture input, not evidence of model
generation. Actual command/outcome/environment and remaining gates belong in
`docs/evidence/issue-373/learning.md` after execution. Use this task as a discovery
replay: follow AGENTS → assistant-ui → this row → the owning file, and verify the
requested acceptance before claiming completion.

See [surface rules](../../better-layout/references/learning-surfaces.md) and
[fixed source/reuse map](issue-373-sources.md).
