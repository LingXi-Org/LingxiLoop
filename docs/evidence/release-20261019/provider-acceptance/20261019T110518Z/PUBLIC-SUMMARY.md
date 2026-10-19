# Formal 3.5.3 provider acceptance

Validation used published `@lyyzka/lingxios@3.5.3`, package gitHead `59be37b141f41798ec03b2fffabb824d3ef50e36`, on product HEAD `ef594b8b8f0091d49ac4d618d2c221bdc54f617a`. Root/server exact locks matched the formal package integrity:

`sha512-e/KhQgtBJlKQl1aM+amJGail2ax8rqGL4Bqw68ehIM+2mlUbaq0WT1FD8WQaGU1/t7TyhYk8gt2IuHlX6OKhfQ==`

| Check | Result |
| --- | --- |
| Existing deterministic provider matrix | 13 passed, 1 failed, 0 skipped, 0 cancelled |
| Real GLM-5.3-Flash canonical validation | 1 passed, 0 failed, 0 skipped |
| Original 3.5.2 evidence restoration | SHA-256 manifests identical |

The matrix's five HTTP fault cases (429, 503, socket reset, stream interruption, and empty output) passed their bounded-attempt, settled-ledger, durable-result and next-human-turn checks. Group mentions, native admission, first-byte timeout and reliability/cancellation coverage also passed. The unchanged 100ms total-deadline case failed because the local provider observed zero requests rather than one. Its failed-run and delivered classified-feedback assertions passed; the remaining assertions in that case were not reached. A separately recorded isolated rerun subsequently passed 1/1; the initial matrix result remains 13/14.

The one real-provider invocation used exact `zai-org/GLM-5.3-Flash`: four successful calls, comprising three Agent/runtime calls and one host JSON helper, with no failed attempts or whole-run retry. It passed the actual files.list tool turn, streamed answer, JSON helper, and durable replay checks. There were 35 preview frames, a final text length of 684, and no text retractions.

Provider-reported usage was 25,466 input tokens and 2,864 output tokens, with no cached input. Tariff-derived total ledger cost was $0.00405601: $0.00400915 for Agent/runtime and $0.00004686 for the helper. This is usage multiplied by the tested tariff, not a supplier deduction receipt. The tariff assertions used CNY 0.8 input, 0.23 cached input and 2.8 output per million tokens, converted at USD/CNY 7.

The configured 8 calls / 100k tokens / $0.25 budget applies to the Agent root. The host JSON helper is outside that root; the whole-run <= $0.25 check is a final ledger assertion, not a preflight hard cap. No extra load was generated to approach a cap.

All test data was synthetic and isolated locally. Matrix and live validation ran serially, with no production changes or paid fault injection. Original 3.5.2 evidence was archived and restored exactly; formal 3.5.3 outputs are stored separately. This summary does not claim the broader historical acceptance issues are closed.

Reproduction uses the existing scripts: `node scripts/runtime-acceptance/provider-fault-matrix.mjs`, followed once by `node --use-env-proxy e2e/server/model-switch.mjs --live` under an existing authorized credential binding. Detailed logs and runtime replay remain private evidence.

## Isolated deadline rerun: PASSED (1/1)

After concurrent browser/test load ended, one authorized rerun used the unchanged launcher with only `runtime-deadline-recovery.test.ts`. It passed 1/1 with zero skips/failures, using the same product HEAD, official 3.5.3 package and integrity. The dependency directory had been copied without content changes into the product worktree; its new physical path is recorded in the rerun provenance. No threshold was changed and no full-matrix rerun occurred.

The actual synthetic provider received one initial request and observed one disconnect. The run failed with model_unavailable feedback, one ledger call settled, one terminal notice was retained, and the next human request succeeded. Measured run elapsed time was 400.35ms (the existing test limit is <3000ms; provider total timeout remains 100ms). The original matrix result remains 13/14; this separate rerun is 1/1. Passing under lower load is consistent with timing sensitivity, but does not establish the cause of the initial failure.

Rerun command: `node scripts/runtime-acceptance/provider-fault-matrix.mjs runtime-deadline-recovery.test.ts`. Paid calls: 0. Old evidence and known auxiliary artifacts were restored byte-for-byte again, and the product worktree remained clean.
