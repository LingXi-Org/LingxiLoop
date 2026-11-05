# Learning experience

Read the affected row before editing. Reuse assistant-ui, Lexical, the native
runtime, Design/Slides editors and existing scoped state. Keep student requests,
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
| Preserve student authorship through `ConversationComposer.tsx` and the existing editable input. Keep ordinary, compact, thread and narrow-screen composers free of persistent learning-help shortcuts. | A student writes their attempt and the help they want in the input, retaining quotes and attachments until they choose to send. | Verify no learning-help controls or empty shortcut row remain; multiline input, send/stop, quotes, attachments and the add menu remain reachable. The learning fixture retains manually entered attempts through artifact actions. |
| Use `server/src/modules/learning/homework-help.ts` and `homework-help-state.ts` for a bound homework's help default; `homework-tools.ts` and `agent-runtime/context.ts` load it after authorization. Keep provider configuration in its existing owner. Follow frozen teacher requirements, honor requested explanation and return an independent next step. | One READY assessment with cited student work leaves a criterion open: give a brief clue. Two such assessments of that same criterion with newly cited work: explain with an analogous example. | Run `homework-help*.test.ts`: repeated evidence, stale epochs, unknown/default criteria and unreadable attachments never increase depth; ordinary chat adds no tutoring rule. Verify teacher requirements/feedback, submission state and editable student attempt remain intact. Synthetic context checks establish the selected default; assess actual teaching quality separately. |
| Use existing learning evidence rules in `server/src/modules/learning/homework-effects.ts`, `forum-assessment.ts` and `artifacts/evidence.ts`. | Saved student work and independent transfer can be evidence; a generated diagram or successful tool call is an artifact/result. | Verify student-origin message IDs/references and assistance in the persisted record. A rendered view, sent feedback or completed explanation cannot upgrade mastery. |

## Resources and scope

Design and Slides saves use expected sha256 (`ifMatch`) checks and retain conflicting
drafts in the editor. Presentation
versions use their existing selector.

Use installed Markdown, Mermaid, code and math renderers. Historical interactive visualizations show a retirement notice and cannot execute.
