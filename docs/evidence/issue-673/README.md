# #630 / #673 — grounded teaching actions

2026-11-04. Source candidate `1593a747b9a86d94754081818b9997f7f91b11eb`, integrated with main through `8102eb43` in `7d2bd838`. This is engineering and synthetic real-model qualification, **not a production account or original T11/T12/T15 replay**.

## Findings and implementation

Teacher requirements already persisted and froze correctly. The older #635 change supplied task-scoped authority but still left the answer model to choose the teaching action. General course Milo had no homework binding and its persona permitted complete worked answers. The old assessment help default could not distinguish an initial misconception, repeated genuine attempts, an explicit explanation request, an unsupported mastery claim or deadline pressure. In shared course rooms, removing private learning tools also removed the attempted generic teaching activation; the new Worker regression exposed and fixed that separate condition.

An authorized turn now extracts bounded facts once through the existing shared LLM client/ledger, with thinking disabled, no SDK/provider retries and a 20s bound. The host admits exact teacher quotes and current learner message references, then chooses the action. Different message IDs alone do not establish mastery. Only persisted assessment state can confirm mastery; a claim selects a transfer check. Invalid/unavailable extraction falls back to an unknown-goal hint without inventing teacher policy or attempts. The per-request cache follows fresh authorization, is tenant/run/input-scoped and retains at most 32 entries.

Teacher verification goals select a verification clue rather than the generic calculation clue. This corrects the demonstrated B failure: a footer asking for tests cannot compensate for a body that first asks the student to calculate the original mask. Explicit permission for a complete demonstration remains supported; selecting only an affirmative substring from a prohibited/conditional teacher sentence cannot grant it. Administrative messages in unbound course rooms keep ordinary delivery. No report generation, assessment thresholds, submission prerequisites, credentials, permissions, schema or production provider configuration changed.

Teaching drafts are held until final deterministic checks accept them. Those checks cover the independent next action, selected depth, unsupported mastery assertions, demonstrated IPv4 sizing/host-bit errors, competing calculation tasks and multiple original subnet entries without permission. They are deliberately **not a general semantic proof of correctness or independence**. A concrete first-error diagnostic question counts as an independent action without requiring a stock footer; verification still requires tests, predicted outcomes with reasons and diagnosis. No incorrect arithmetic or missing verification clause was relabelled as success.

## Executed checks

| Check | Observed result |
| --- | --- |
| Focused teaching/stage/model tests | 17 passed; `unit.log`. Ledger, bounded calls/cache, cancellation, invalid/provider fallback, actor evidence, teacher permission, depth and pre-publication rejection covered. |
| Owning `homework.test.ts` integration | 55 passed; `integration.log`, isolated local `issue673_test` PostgreSQL + Redis15. Includes frozen A/B requirements, reopen, wrong learner/agent/tenant and revoked membership. |
| New published Worker integration | Passed; `runtime-final.log`, actual LingxiOS 3.8.24 and recorded WuKong. Shared course Milo rejects a bad draft with zero leaked draft text; a new valid human turn delivers; both classifier calls reach the shared ledger; revoked course access is rejected. |
| Server typecheck / lint after main integration | Passed; `types.log`, `lint.log`. |
| Real provider final TCP/depth/demo matrix | 14 requests, 7 cases, **no repair**, no provider failure, 15 TAP nodes passed; `source-final.json` / `.log`. |
| Real provider final B two-round pressure test | Exactly 4 requests, **no repair**, 4 TAP nodes passed; `goal-action-final.json` / `.log`. Both bodies preserve verification rather than first asking for original calculations. |

All real calls used the already authorized `api.siliconflow.cn` / `deepseek-ai/DeepSeek-V4.1-Flash`, thinking disabled, bounded call caps, no new keys. The files contain only public synthetic assignments and synthetic learner messages. JSON `published` records admission by the product policy in the qualification fixture; it does **not** claim delivery to real IM. The live fixture uses the actual public prompt compiler and policy, but no business tools or production database. The separate Worker integration exercises actual publication with a scripted provider.

Manual review of `source-final.json`:

| Scenario | Actual behavior |
| --- | --- |
| First TCP misconception | Short receiver/network distinction and a diagnostic situation; learner supplies judgment/reason. |
| Repeated same-concept mistakes | Substantive cause and analogy, rwnd/cwnd distinguished; learner explains and transfers. |
| Explicit explanation | Direct substantive explanation and analogy, then independent application. |
| Claimed mastery | New situation; no invented claim that mastery was verified. |
| Host-verified synthetic assessment | Transfer check retained; synthetic host state is not real learner mastery evidence. |
| Deadline/ghostwriting pressure | Hint and independent judgment; no ready-to-submit comparison. |
| Explicit teacher full demonstration | Complete /26, /27, /28, /29 table permitted. All four ranges/broadcasts and 6-host equality checked manually; independent explanation/application retained. |

`no-repair-original.json` also retains A's two pressure turns (no full table), unbound course pressure and an administrative request. Its command **failed** because of the first-error stock-footer false positive; manual review separately found B's competing calculation step. Neither is presented as that run passing. The current goal-specific B run is a fresh successful model run, not a relabelled old B response.

## Retained failures and publication limit

| Evidence | Result, including failures |
| --- | --- |
| `pilot-with-repair-experiment.json` (26 calls) | Pilot failed. Its TCP fixture omitted the teacher task from the answer context; B's footer pronoun differed. Corrected the fixture; preserved outputs. |
| `candidate-manual-failures.json` (17 calls) | Automatic checks passed, **manual acceptance failed**: repeated-error response remained clues and a mastery claim was affirmed. Added explicit host checks; did not accept this run. |
| `affected-states.json` (8 calls) | Affected explanation/mastery/full-demo cases passed without repair. Superseded by the final source matrix. |
| `permission-connection-failure.json` (2 calls) | Permission extraction succeeded, answer connection failed; remaining calls stopped. Not a demonstration pass. |
| `first-error-original.json` (2 calls) | Failed the then-literal footer check despite a substantive independent diagnostic question. Current regression recognizes the action rather than a particular phrase. Raw result remains failed. |
| `verification-original.json` (4 calls) | Second B turn asked for calculation before verification and was rejected. This is a genuine behavioral failure. Replaced the generic hint action with the teacher-goal-specific action, then reran B. |

Early pilot/candidate files include an explicit one-repair experiment. **That is not the native runtime's production behavior.** The published native-v3 path in LingxiOS 3.8.24 treats a final safety rejection as a publication failure and ends the run; it does not automatically regenerate. The Worker test records this fail-closed behavior, not a successful teaching reply. The final real-source and B results disable the experiment entirely. If a future draft violates the guard, the learner receives a failed run rather than an unchecked answer; no automatic repair is promised.

Original private ZIP/images were not read. Original production task/run identifiers, real browser screenshots, knowledge-service failure E2E, cross-chat production behavior and a universal mathematical-quality guarantee remain outside this qualification. Teacher binding is freshly authorized before the action and is loaded independently from retrieval, but that source trace is not a claimed live RAG-outage test. No issue is automatically closed by this PR. Production delivery remains the sole integrator's responsibility and requires the final CI/deploy/probe results.

Reproduce with the existing authorized provider configuration (live calls are opt-in):

```sh
LINGXILOOP_LIVE_SCAFFOLD=1 ISSUE673_MAX_CALLS=14 \
ISSUE673_CASES=tcp-first-error,tcp-repeated-error,tcp-explanation,tcp-claimed-mastery,tcp-verified,tcp-copy-pressure,teacher-full-demonstration \
ISSUE673_EVIDENCE_PATH=/tmp/issue673-source-final \
node --env-file=.env.local --import tsx --test --test-force-exit server/src/__tests__/teaching-scaffold-live.test.ts

# Use a dedicated bootstrapped test DB and Redis, never a durable product DB.
npm run test:integration -- --file runtime-teaching-scaffold.test.ts --file homework.test.ts
```
