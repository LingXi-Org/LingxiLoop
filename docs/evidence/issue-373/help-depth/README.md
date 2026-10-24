# #373 item7: homework help defaults

Base: merged main `6a10d3216f10a9c9f8ad4de5db636e66f35f56c0`.
Scope is the original item7 gap: use reliable existing learning observations to
choose a help default, independently of provider reasoning configuration.

## Actual change

The real `loadHomeworkTurnContext` now supplies a bounded help plan when called
by the model-context loader. The capability resolver retains its original path
without the extra assessment read. The ordinary/teacher conversation path gets
no homework help rule. Existing editable hint/explain/check composer actions
remain unchanged and retain the student's original attempt and attachments.
Their editable text is not parsed into trusted intent or authority.

The existing private homework binding and course permission checks run first.
One SELECT reads at most two existing READY assessments for the same company,
homework, learner and current return epoch, at or before the current evidence
revision. The current assessment ID/revision must be present. The selector uses
only exact current criterion labels and genuine selected student quotations
matched against the stored canonical transcript. Existing attachment availability
checks must still allow both observations.

One supported open criterion selects a brief clue. A second assessment can raise
the default only when the same criterion remains open and its selected quotation
contains a newly cited student message with a later canonical sequence. Reusing
an assessment receipt or the same quotes does not create another observation.
The output counts observed assessments, not all attempts, errors or ability.
The indicated criterion is a zero-based index into the frozen homework criteria.

Pending/INVALID results, missing or malformed evidence, unknown/default unmet
criteria, stale epochs, wrong current IDs/revisions and unavailable evidence give
an unknown brief-help default. An earlier READY assessment cannot stand in for a
pending current one. A criterion marked met with independence still uncertain is
not treated as an error and does not cause any mastery update.

Short positive response rules keep frozen teacher requirements and current
feedback first, and explicitly honor the learner’s requested help style. Hints/checking begin with one clue; recurring assessed gaps or
requested explanation get a principle and analogous example, followed by one
independent next step. Actual user requests control style within the task scope;
they do not authorize a complete homework answer. The existing answer, report,
submission, teacher review and mastery rules are unchanged.

No new assessment is scheduled, no generic judge/model/provider call is added,
and no runtime effort, model, budget or persona configuration changes. Ordinary
chat is not forced through a homework workflow. General course chats currently
have no reliable single-task performance binding, so no task/error is guessed
from their messages or assignment list.

## Verification

- The actual homework-context regression failed before wiring: expected
  explanation was undefined. `context-before.txt` retains the failure.
- Ten focused tests passed in `focused-after.txt`: first/repeated supported gap,
  same receipt/quotes, older evidence, selected-but-uncited work, old epoch,
  PENDING/INVALID/unknown/default criteria, no open gap, criterion focus, scoped
  two-row read, attachment availability, current-assessment identity, real
  homework context with unchanged teacher text/state, ordinary chat, authorization
  mismatch, no extra capability reads, and existing composer attempt retention.
- Server TypeScript check passed after materializing the existing tracked
  `e2e/homework/meter.js` dependency omitted by the sparse checkout. No product
  type was altered to work around the environment.
- Focused Biome lint passed for the seven owning TypeScript files.
- No browser, provider or production operation ran. The tests exercise policy
  selection and actual context assembly with synthetic public records; they do
  not establish live model teaching quality or student mastery.

Independent review and exact CI are reported on the draft PR. #373 stays open:
this does not certify all eight issue sections. Rollback removes the new help
loader/rule calls, leaving the existing homework context and editable requests.

Skill discovery: AGENTS → assistant-ui → learning-experience pedagogy row →
`homework-help.ts`, `homework-help-state.ts`, context/owning tests. The row gives
one correct example and a reproducible observable acceptance without claiming
unrun model behavior.
