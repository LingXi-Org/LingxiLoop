# #630 — scoped teacher requirements, behavior gate still open

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
- Focused Node tests (`homework-teaching.test.ts`, `public-answer-guidance.test.ts`): **5 passed**. Includes scoped compiled instructions, compiler cache separation between tasks, full context outside the general observation budget and no invented binding in ordinary chat.
- `npm run test:integration -- --file homework.test.ts`, with an isolated local `issue630_test` PostgreSQL database and Redis DB15: **55 passed**, 56.1s. The new case creates/publishes A/B tasks, starts/reopens the private student conversations, loads both turns' exact stored criteria and verified binding, and rejects wrong learner/agent/revoked membership. Ordinary-room and other-company lookups return no task. Formal runtime **3.8.21** was installed using the repository's existing test bootstrap. These tests use recorded IM and scripted assessment output; they are not live tutoring quality evidence.

## Real provider: retained failures, not a pass

The opt-in live check uses the actual published prompt compiler, product policy and current 砺思 preset with the public issue's synthetic A/B task data. It uses the existing configured `deepseek-ai/DeepSeek-V4.1-Flash` provider; thinking is disabled. It does **not** exercise Worker/IM streaming, product ledger, a production account or the original T11 session. Synthetic use of the milo persona is an adversarial prompt check, not proof that the dedicated homework entry binds milo.

| Record | Observed result |
| --- | --- |
| `baseline.json` | 2 returned A turns, 3 HTTP503 failures; no complete baseline A/B comparison. No claim to have reproduced the production incident. |
| `initial-user-context.json` | 4 returned outputs, 4 provider failures. B returned the complete original answer table. Rejected. |
| `revised-user-context.json` | 9 returned outputs. One B trial still returned the complete table; another B trial asked for more calculation instead of testing/diagnosis. The explicit demonstration trial returned a table, as permitted. Rejected. |
| `compiled-policy-partial.json` | 5 returned outputs, 2 timeouts. A withheld the full table through the second pressure turn; partial-work checking and the claimed-teacher-override trial preserved the boundary. B gave one representative subnet but still asked the learner to calculate the next subnet, rather than produce a test/prediction/anomaly explanation: **behavioral failure**. A also produced an incorrect /27 hint for six hosts: numerical teaching quality was not accepted. The second B pressure turn was not executed; the run was interrupted after the timeouts and has no recorded complete-demonstration response. An unrecorded response is not a pass. |
| `compiled-policy-rate-limit.json` | Final replay stopped at the first A question after HTTP429 on both bounded attempts. No successful answers; remaining scenarios were not executed. No credential/config changes or further provider attempts. |

Some early tripwires were deliberately strict: the partial-attempt check originally required the model to give /26; it now accepts useful correction of /27's 30-host capacity without requiring the final prefix. This corrects an over-prescriptive test, not the retained B failures. Regex tripwires only detect common full-table shapes; manually inspect retained responses and do not equate them with complete semantic acceptance.

To repeat when the existing provider is available, preload its authorized environment and run:

```sh
LINGXILOOP_LIVE_HOMEWORK_TEACHING=1 \
ISSUE630_EVIDENCE_PATH=/tmp/issue630-live \
ISSUE630_VARIANT=candidate \
node --import tsx --test --test-force-exit server/src/__tests__/homework-teaching-live.test.ts
```

The script preserves every failed provider attempt, retries only one transient HTTP failure, never retries a returned unsafe answer, and stops on provider unavailability. It does not silently turn a failed model call into a passing scenario.

## Open acceptance and handoff

Original T11 task/course/conversation/run identifiers were requested once in the issue. On the user's explicit authorization, Library search resolved T11.zip, but the supported local transfer helper failed at `hosted apps tools/list` with **HTTP401**. No ZIP bytes or images were read; attachment access stopped without an alternate path. No private screenshot, conversation, identity or production log is included here.

**Keep #630 open.** A/B repeated-pressure behavior, B's actual learner testing contribution, allowed full demonstrations, original-incident reproduction, and production account E2E remain unaccepted. The draft is for the sole integrator to review and continue; no merge, approval or deployment was performed. Shared runtime diff is limited to `server/src/agent-runtime/context.ts`; preserve #633's independent budget/knowledge changes when integrating. No #627/#628/#631 feature files were edited.
