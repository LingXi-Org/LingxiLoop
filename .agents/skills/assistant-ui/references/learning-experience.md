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
| Render artifacts through MarkdownText and ArtifactEditorFrame (vendored baoyu-design Design and Slides editors). Use Design proactively for complex or broad explanations while preserving explicit text-only requests and learning boundaries. Legacy Visualize references use AnswerText and ArchivedVisualizeReferences only. | A learner opens the named explanatory artboard in this conversation’s Design pane, edits it, saves and reopens. | Run the model-to-Design browser flow; verify current conversation ownership, saved files, latest zero-problem check, keyboard access, conflicts and permission revocation. Legacy messages keep their original body and export inert source/state under current ACL; never mount old HTML. |
| Preserve student authorship through `ConversationComposer.tsx` and the existing editable input. Keep ordinary, compact, thread and narrow-screen composers free of persistent learning-help shortcuts. | A student writes their attempt and the help they want in the input, retaining quotes and attachments until they choose to send. | Verify no learning-help controls or empty shortcut row remain; multiline input, send/stop, quotes, attachments and the add menu remain reachable. The learning fixture retains manually entered attempts through artifact actions. |
| Use `server/src/modules/learning/homework-help.ts` and `homework-help-state.ts` for a bound homework's help default; `homework-tools.ts` and `agent-runtime/context.ts` load it after authorization. Keep provider configuration in its existing owner. Follow frozen teacher requirements, honor requested explanation and return an independent next step. | One READY assessment with cited student work leaves a criterion open: give a brief clue. Two such assessments of that same criterion with newly cited work: explain with an analogous example. | Run `homework-help*.test.ts`: repeated evidence, stale epochs, unknown/default criteria and unreadable attachments never increase depth; ordinary chat adds no tutoring rule. Verify teacher requirements/feedback, submission state and editable student attempt remain intact. Synthetic context checks establish the selected default; assess actual teaching quality separately. |
| Use existing learning evidence rules in `server/src/modules/learning/homework-effects.ts`, `forum-assessment.ts` and `artifacts/evidence.ts`. | Saved student work and independent transfer can be evidence; a generated diagram or successful tool call is an artifact/result. | Verify student-origin message IDs/references and assistance in the persisted record. A rendered view, sent feedback or completed explanation cannot upgrade mastery. |

## Resources and scope

Design and Slides resources belong to their own compiled editors. Shared formula
sources live in `shared/artifact-math.ts` and `shared/artifact-math-loader.ts`;
Design owns its hashed offline/online formula assets. Markdown, Mermaid, code
and math use installed renderers. No retired Visualize or GenUI runtime executes.

Design and Slides saves use expected sha256 (`ifMatch`) checks and retain
conflicting drafts in the editor. Read current saved files before changing them;
a new explanatory board must preserve existing human work. A successful save
and subsequent `design.check` with zero problems precede a completion claim.
Historical Visualize source, personal state and reference metadata remain durable;
see [recovery](../../../../docs/visualize.md) for the authorized inert archive.

## Historical #373 example and evidence (retired by #670)

#373 adds a small `sendFollowUp` facade to the retained GenUiPage and delegates to
the existing guarded `followUp` operation. The isolated context publisher supplies complete snapshots to the pinned guest,
which consumes missing annotation as cleared state. The host card's editable question
dialog provides continuation even when the generated guest has no question
button. It keeps request text in the existing scoped V2 cache after an unconfirmed response, never automatically resends a restored draft, and reports accepted
delivery separately from later results. `TweakPanel` reports accepted changes.
At the historical #373 delivery, the composer added three editable help intents
using its public API. #446 retires those persistent shortcuts and their helper
components; students express the help they want in the existing editable input.

The now-retired `e2e/visualize/learning.e2e.ts` used production card/page/SDK and resizable
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
