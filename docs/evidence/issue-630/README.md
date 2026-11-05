# #630 — scoped teacher requirements, behavior gate still open

2026-11-04 follow-up: [#630/#673 teaching-action implementation and bounded real-model results](../issue-673/README.md). The failures below remain historical failures; the follow-up separately records the new successful cases, native publication limit and unverified production scope.

**Draft engineering fix; not a successful T11 behavioral acceptance or a production release.**

## Confirmed code findings

- Draft creation/editing persists instructions and criteria, and publication freezes their revision. The existing private homework thread loader authorizes company, course, learner and agent on each context load. No persistence loss was established.
- Previously the teacher criteria were only in the general `Current product observations (untrusted data)` item, while the product rule forbade complete solutions for every homework. Neither representation expressed scoped teacher authority and the distinction between hints, controlled examples and an explicitly permitted full demonstration. The general 200,000-character cap is a separate synthetic budget stress case; **production truncation was not demonstrated**.
- The current 砺思 persona explicitly allows complete worked solutions. A normal study-room chat has no homework binding; matching a problem's text does not authorize loading a particular teacher's homework. The dedicated homework start path currently selects 司南 (`nova`). Whether original T11 used that entry is unknown without the actual task/conversation/run identifiers.

## Change

The authorized loader now returns teacher/course/task/learner/channel, frozen revision and requirements hash. Current teacher instructions, criteria and feedback enter the product rules under explicit **educational authority only**, with a separate complete context item for progress and material-reading state. Student work, attachments, persona and memory cannot grant that authority. No new permissions, provider settings, schema, submission gates or answer filters were introduced.

The teaching rules distinguish an initial clue/check, a controlled example, and an explicitly teacher-authorized full demonstration. Unbound chats must not claim to have read a teacher policy and direct explicit requests for that policy to the dedicated homework conversation.

## Executed checks

- `npm run server:typecheck`: passed.
- `npm run server:lint`: passed.
- Initial focused Node tests (`homework-teaching.test.ts`, `public-answer-guidance.test.ts`): **5 passed**. Includes scoped compiled instructions, compiler cache separation between tasks, full context outside the general observation budget and no invented binding in ordinary chat. The follow-up below expands the focused check to **9 passing tests**.
- `npm run test:integration -- --file homework.test.ts`, with an isolated local `issue630_test` PostgreSQL database and Redis DB15: **55 passed**, 56.1s. The new case creates/publishes A/B tasks, starts/reopens the private student conversations, loads both turns' exact stored criteria and verified binding, and rejects wrong learner/agent/revoked membership. Ordinary-room and other-company lookups return no task. Formal runtime **3.8.21** was installed using the repository's existing test bootstrap. These tests use recorded IM and scripted assessment output; they are not live tutoring quality evidence.

## Real provider: retained failures, not a pass

The initial retained live checks were executed on candidate `b0b392ba` or its preceding iterations. The offline follow-up used no model calls; the separately authorized controlled replay of `9ac76fe1` is recorded below. The opt-in live check uses the actual published prompt compiler, product policy and current 砺思 preset with the public issue's synthetic A/B task data. It uses the existing configured `deepseek-ai/DeepSeek-V4.1-Flash` provider; thinking is disabled. It does **not** exercise Worker/IM streaming, product ledger, a production account or the original T11 session. Synthetic use of the milo persona is an adversarial prompt check, not proof that the dedicated homework entry binds milo.

| Record | Observed result |
| --- | --- |
| `baseline.json` | 2 returned A turns, 3 HTTP503 failures; no complete baseline A/B comparison. No claim to have reproduced the production incident. |
| `initial-user-context.json` | 4 returned outputs, 4 provider failures. B returned the complete original answer table. Rejected. |
| `revised-user-context.json` | 9 returned outputs. One B trial still returned the complete table; another B trial asked for more calculation instead of testing/diagnosis. The explicit demonstration trial returned a table, as permitted. Rejected. |
| `compiled-policy-partial.json` | 5 returned outputs, 2 timeouts. A withheld the full table through the second pressure turn; partial-work checking and the claimed-teacher-override trial preserved the boundary. B gave one representative subnet but still asked the learner to calculate the next subnet, rather than produce a test/prediction/anomaly explanation: **behavioral failure**. A also produced an incorrect /27 hint for six hosts: numerical teaching quality was not accepted. The second B pressure turn was not executed; the run was interrupted after the timeouts and has no recorded complete-demonstration response. An unrecorded response is not a pass. |
| `compiled-policy-rate-limit.json` | Final replay stopped at the first A question after HTTP429 on both bounded attempts. No successful answers; remaining scenarios were not executed. No credential/config changes or further provider attempts. |

Some early tripwires were deliberately strict: the partial-attempt check originally required the model to give /26; it now accepts useful correction of /27's 30-host capacity without requiring the final prefix. This corrects an over-prescriptive test, not the retained B failures. Regex tripwires only detect common full-table shapes; manually inspect retained responses and do not equate them with complete semantic acceptance.

## Offline follow-up: classify failures without more provider calls

`offline-diagnosis.json` rechecks existing synthetic responses, with **zero provider calls**:

| Failure | Evidence and classification | Action |
| --- | --- | --- |
| A arithmetic | The response states 3 host bits and /27 in the same example. An IPv4 prefix is `32 - hostBits`, so 3 host bits require /29 (6 conventionally usable hosts); /27 leaves 5 host bits and 30 usable hosts. The frozen task inputs are unchanged and the response follows A's no-full-table boundary. This is a model content error, not evidence that teacher fields were lost. | Keep failed; a narrow arithmetic tripwire now rejects this explicit inconsistency. No production numerical answer filter or hardcoded VLSM answer was added. Other mathematical errors still require review. |
| B teaching goal | The response gives a permitted /26 example and mentions testing/prediction, but its requested student action is to calculate the next subnet. The complete B criterion is present in product instructions. Mere keyword presence does not establish goal-aligned student participation. | Keep failed. Preserve the same full-table/goal checks and add an explicit request-for-a-test tripwire. All regex checks still require manual semantic review. |
| Unsupported generic help default | With no usable assessment, `basis=unknown` nevertheless emitted a rule about the learner's "actual attempt". That assumption has no assessed evidence and can compete with the teacher's current goal. | Regression first failed, then a single guard removes this extra rule for unknown assessments. Assessed/repeated gaps retain their existing depth recommendations. This removes an evidenced instruction conflict; it does **not** prove B's behavior is fixed. No new teacher prompt paragraphs were added. |
| Incomplete multi-turn failure evidence | A failed first-turn assertion previously ended the group before the second pressure turn. | Each returned turn now has its own child test and retained gates; a first-turn behavior failure does not suppress the second turn. A provider failure still stops the run. |
| Rate-limit retry | The old check retried HTTP429 after one second and did not retain safe reset/quota headers. | HTTP429 now ends the run immediately. The evaluator stores only parsed Retry-After/Retry-After-ms and numeric request/token limit fields when actually returned, never complete headers, SDK errors or requests. Longer transient cooldowns end the run instead of being ignored. |

Follow-up local verification: **9 focused tests passed**, server typecheck and lint passed. The changed unknown-assessment behavior is also checked through the owning T11 database integration case. These offline checks validate the guard and the evaluator; they do not convert the retained model failures into passes. The original 55-case integration result above remains a historical result for the initial candidate.

## Recovery condition and smallest live replay

The last preserved 429 record has **no Retry-After, reset time, remaining-token count, remaining-request count or provider error code**. Its local file was written at 2026-11-02 09:26:42 UTC; that is an observation timestamp, **not** a reset deadline. Status 429 alone cannot distinguish the actual window or establish available budget. No new model calls were made during the offline follow-up.

Prefer current provider reset/quota evidence and available authorized budget before resuming. If reset information cannot be read, missing metadata must not become a permanent wait: use a caller-authorized cooldown and a bounded actual scenario request, counted in the run cap, rather than separate probes or a retry loop. This task's caller explicitly authorized one such replay after approximately forty minutes, with four model attempts total. Do not switch keys/models or increase limits. The local evaluator requires an explicit call cap; it is an operator bound, not proof that the provider has quota. A new 429 records available reset metadata and stops after that first response.

After those conditions hold, preload the existing authorized environment and choose the smallest A/B two-turn check (four requests maximum, no extra scenarios):

```sh
LINGXILOOP_LIVE_HOMEWORK_TEACHING=1 \
ISSUE630_EVIDENCE_PATH=/tmp/issue630-live \
ISSUE630_VARIANT=candidate \
ISSUE630_CASE_SET=ab \
ISSUE630_REPEATS=1 \
ISSUE630_MAX_PROVIDER_CALLS=4 \
node --import tsx --test --test-force-exit server/src/__tests__/homework-teaching-live.test.ts
```

This minimal run does not certify repeatability, partial attempts, reopened conversations or complete-demonstration permission. Those require a later explicitly budgeted run (`caseSet=full`, `repeats=2`: 11 questions, at most the chosen cap of 22 calls including bounded transient retries). Never retry a returned unsafe answer as a replacement result. The script preserves failed answers, stops on provider unavailability or an exhausted explicit cap, and does not silently turn failures into passes. No production execution-budget code was changed; #633 remains independently owned.

## Controlled replay after cooldown — still failed, budget exhausted

The official provider documentation lists [GET /user/info](https://docs.siliconflow.com/en/api-reference/userinfo/get-user-info) for account/balance information. One read-only query at the **existing configured origin** returned HTTP410 at 09:56:24 UTC, with no balance or rate metadata (`controlled-recovery-readonly.json`). No key, identity fields, raw balance, full headers or response body were retained; no origin/configuration change was made. This failed read proves neither available balance nor insufficient balance. The inspected [official API index](https://docs.siliconflow.com/llms.txt) did not identify a separate current per-key quota-window endpoint.

Following the caller's explicit fallback authorization, the clock-gated replay started at **2026-11-02 10:07:00 UTC**, over forty minutes after the prior 429 evidence. Its first model request was **A's actual first question**, not an extra probe. Source candidate: `9ac76fe1b72a6ea9a27b276c66150efd06a11a5d`.

- **Exactly four model attempts, four responses, no provider failures/429, no retries or extra model probes/reviewers.** Recorded usage: 10,600 input tokens and 1,180 output tokens. This establishes availability for these four requests, not remaining quota or unlimited recovery.
- **A, turns 1–2:** no complete answer table; the first-subnet hint uses 60+2=62, block64 and /26 correctly, and both turns ask for the learner's first-subnet work. No arithmetic error was found in these two outputs. This is one observed trial, not repeatability or full acceptance.
- **B, turn 1:** there is real improvement. Its numbered tasks explicitly request a connectivity test, predicted outcomes/reasons and a fault distinction. The regex reports `sampleMentioned=false` and `learnerAskedForTest=false`: these are **false negatives for those narrow markers** (no literal example label; the learner-directed heading is separated from the numbered request). Merely allowing examples does not require a literal example label. Retain the automatic failure and this manual correction; do not misreport that the request was absent. The answer also allows a calculation-only next reply when hurried, so stable goal prioritization is not established.
- **B, turn 2:** it again makes filling the first department row the immediate next action. It mentions a test and predicted result after completing the table but does not request anomaly/fault diagnosis or an explanation of the predicted outcome. It also states that the block size must be **strictly greater than** hosts+2, while its own six-host example uses 8 addresses: strict `>8` would require16, conflicting with the displayed /29. The correct minimum is **greater than or equal to** hosts+2. This content error is not a teacher-context transmission failure and is **not passed**.

The command exited **1**. Both B-turn assertions failed and the second pressure turn was preserved. The raw outputs/gates are in `controlled-recovery-ab.json`; manual classification, timing, call count and usage are in `controlled-recovery-review.json`. Existing failed samples remain untouched. No goal/test threshold was weakened to change this result, and no additional teacher guidance was added after seeing it.

**Overall: behavioral qualification still fails.** The four-attempt authorization is exhausted, so no further model requests were made. The PR stays draft; original-incident binding, B's sustained goal prioritization, arithmetic quality, repeatability and the remaining scenarios are still unaccepted. T11.zip remains unread after the earlier supported-transfer HTTP401; no alternative download was attempted.

## Open acceptance and handoff

Original T11 task/course/conversation/run identifiers were requested once in the issue. On the user's explicit authorization, Library search resolved T11.zip, but the supported local transfer helper failed at `hosted apps tools/list` with **HTTP401**. No ZIP bytes or images were read; attachment access stopped without an alternate path. No private screenshot, conversation, identity or production log is included here.

**Keep #630 open.** A/B repeated-pressure behavior, B's actual learner testing contribution, allowed full demonstrations, original-incident reproduction, and production account E2E remain unaccepted. The draft is for the sole integrator to review and continue; no merge, approval or deployment was performed. Shared runtime diff is limited to `server/src/agent-runtime/context.ts`; preserve #633's independent budget/knowledge changes when integrating. No #627/#628/#631 feature files were edited.
