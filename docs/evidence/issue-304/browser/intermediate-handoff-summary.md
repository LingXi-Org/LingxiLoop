### 🔴 e2e: 1 failed, 2 passed

**🔴 real v2 first character, pending acceptance and final handoff preserve answer DOM and selection**
`e2e/answer-first/v2-stream.e2e.ts:47`

**ASSERTION_FAILED**

> expected {"body":true,"part":true,"markdown":true,"selection":"交换机","deltaY":20} to equal {"body":true,"part":true,"markdown":true,"selection":"交换机","deltaY":0}

- Screen: `/e2e/answer-first.html`

Evidence: screenshot `.e2e/answer-first/artifacts/desktop/e2e_answer-first_v2-stream.e2e.ts__real_20v2_20first_20character_2C_20pending_20acceptance_20and_20final_20hand-cd5c2c8e/default/attempt-0/screenshots/001-failure.png`, trace `.e2e/answer-first/artifacts/desktop/e2e_answer-first_v2-stream.e2e.ts__real_20v2_20first_20character_2C_20pending_20acceptance_20and_20final_20hand-cd5c2c8e/default/attempt-0/trace/trace.zip`, log `.e2e/answer-first/artifacts/desktop/e2e_answer-first_v2-stream.e2e.ts__real_20v2_20first_20character_2C_20pending_20acceptance_20and_20final_20hand-cd5c2c8e/default/attempt-0/failure/screen.txt` · Details: `.e2e/answer-first/failures/e2e_answer-first_v2-stream.e2e.ts-real_v2_first_character__pending_acceptance_and_final_handoff_preserve_answer-18e96541-2668af4f.md`

<details>
<summary>All 3 tests in 2 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/answer-first/v2-stream.e2e.ts** · 1 failed, 1 passed | 25.4s |
| 🔴 | real v2 first character, pending acceptance and final handoff preserve answer DOM and selection | 13.6s |
| 🟢 | real superseded candidate leaves the main answer and correction receives a new identity | 11.8s |
| 🟢 | **e2e/answer-first/visualize.e2e.ts** · 1 passed | 9.4s |
| 🟢 | completed replay preserves the visualization and owner change rebinds acquisition | 9.4s |
</details>

<sub>e2e 0.17.0 · 42.6s · desktop</sub>
