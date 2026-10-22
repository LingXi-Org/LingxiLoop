# Message layout failure model (#304)

Prepared before implementation against d5481cd258058784e7004169b5ef1235460384f1, assistant-ui 0.15.16. Only synthetic repository fixtures; no production access.

- Interleaved commentary and tools create multiple process disclosures; a complete tool card must have one owner.
- Reordering original indices at accepted handoff remounts the answer. Preserve the trusted accepted activity identity and render each original index with PartByIndex inside a fixed body region. String equality cannot establish identity.
- A new request or actual owner/source change reuses stale interactive state. Reset request identity and keep the real visualization authorization target current.
- Rich output is mistaken for a process or a deliverable using its tool name. Only explicit public semantics establish a hidden process; unclassified legacy parts remain visible.
- Tool interrupt plus awaiting_input produces two forms. Choose the unique current interrupt for the same request; multiple ambiguous interrupts leave the run-level form as owner.
- Duplicate approval parts or a replayed resolved approval can submit twice. Choose one current matching approval identity; recheck the live state before submitting. Historical/read-only records render no active form.
- Missing permission hides the reason a run is waiting. Keep the current waiting notice visible while disabling submission.
- A recovered tool error remains an external failure after a successful run, or an unresolved failure disappears into process. Respect current outcome and preserve unresolved attention.
- Body footer/actions move into collapsed process, multimedia order changes, unsupported parts disappear, or quotation styling regresses. Keep all existing part renderers, original body order and footer ownership.
- Historical page content gains live control or superseded accepted text reappears as body. History scopes are read-only and every historical entry stays in the one activity disclosure.

Component regressions cover routing and form counts; parent integration owns v2 accepted DOM continuity and official browser scenarios (narrow/light/dark, keyboard and pagination races).

## Focused implementation evidence

- Before implementation, the 18 conversation component cases had 3 expected failures (tools outside, duplicate input, no stable body region); the existing 15 passed.
- After integration, `node --experimental-test-module-mocks --import tsx --test --test-force-exit src/features/chat/components/ConversationMessage.test.tsx src/features/chat/components/message-presentation.test.ts` passed 24/24. A newly discovered ambiguous-interrupt attention case was also exercised red then green in the six helper cases.
- `tsc --noEmit` completed successfully after fixture typing fixes. Focused Biome lint and `git diff --check` passed. Browser continuity, clipboard, paging and permissions checks are owned by the parent integration fixture; these component checks do not claim browser or production acceptance.
- Page entries use the official read-only message/part scope and never replace the live message. They have no current action controls. Known event orders sort stably; legacy entries without order retain their server slots. The body retains the original indexed native-part runtime.
- Visualization receives the real current `sourceMessageId`; no previous source identity is frozen to hide an authorization handoff. Actual owner/source changes still go through the existing acquisition checks.
