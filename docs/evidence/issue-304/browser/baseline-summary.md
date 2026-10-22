### 🔴 e2e: 1 failed

**🔴 native interrupt and awaiting_input have one actionable continuation**
`e2e/answer-first/attention.e2e.ts:8`

**ASSERTION_FAILED** at step 2 of 2: `expect.toHaveCount getByRole("textbox", name: "补充信息")`, after 10.1s

- Expected: count 1
- Observed: count 2 (2 matches)
- Screen: `/e2e/questionnaire.html?mode=native-unbound`

Evidence: screenshot `.e2e/answer-first/artifacts/desktop/e2e_answer-first_attention.e2e.ts__native_20interrupt_20and_20awaiting_input_20have_20one_20actionable_20contin-c9fd5258/default/attempt-0/screenshots/001-failure.png`, trace `.e2e/answer-first/artifacts/desktop/e2e_answer-first_attention.e2e.ts__native_20interrupt_20and_20awaiting_input_20have_20one_20actionable_20contin-c9fd5258/default/attempt-0/trace/trace.zip`, log `.e2e/answer-first/artifacts/desktop/e2e_answer-first_attention.e2e.ts__native_20interrupt_20and_20awaiting_input_20have_20one_20actionable_20contin-c9fd5258/default/attempt-0/failure/screen.txt` · Details: `.e2e/answer-first/failures/e2e_answer-first_attention.e2e.ts-native_interrupt_and_awaiting_input_have_one_actionable_continuation-74492c74-b222d331.md`

<details>
<summary>All 1 test in 1 file</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/answer-first/attention.e2e.ts** · 1 failed | 32.0s |
| 🔴 | native interrupt and awaiting_input have one actionable continuation | 32.0s |
</details>

<sub>e2e 0.17.0 · 36.6s · desktop</sub>
