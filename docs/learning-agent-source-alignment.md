# Learning agent source alignment

LingxiLoop's education orchestration is implemented against two pinned source
baselines rather than an independently invented agent design:

- `ApodexAI/FrontierAgent@ef326d07207e8ab4adacfa63861f7a76813192b5`
- `xai-org/grok-prompts@a7c186f5ccac95875c0041aed60398f6ecb6d6c7`

## FrontierAgent mapping

| Upstream source | LingxiLoop production mapping |
| --- | --- |
| `plugins/tools/task_board.py` | `learning_missions` plus ordered `learning_mission_steps`; duplicate trigger messages return the same Mission |
| `observers/planning_gate.py` | Mission `planning` state, Host action allowlist, `finishMissionPlanning`, and final-answer gate in AgentOS |
| `observers/auto_fan_in.py` | Existing durable Canvas assignments, frames and follow-up work items; state is reloaded on every model turn |
| `plugins/tools/submit_report.py` | Structured specialist/verifier Canvas report contract plus `record_attempt` and `propose_evaluation` for evidence-bearing learner outcomes |
| `observers/no_progress_guard.py` | Duplicate Mission/action idempotency, bounded AgentOS hops, and coordinator anti-spin instructions |
| `observers/unassigned_nudge.py` | Coordinator prompt requires checkable ownership and forbids synthesis while Mission work is unresolved |

FrontierAgent's ReAct loop, AgentBus, tool registry and sub-agent runtime are not
copied. Canvas and AgentOS remain the only LingxiLoop execution runtime.

## grok-prompts mapping

`prompt-assembly.ts` follows the published Jinja templates' ordering:

1. function-call budget;
2. identity;
3. highest-priority policy block;
4. conditionally rendered capability sections;
5. role-specific workflow;
6. role personality and behavioural rules;
7. user/course information;
8. current date.

The stable sections form a cache-stable system prefix for a compaction epoch.
Host-scoped `learningContext` is appended as a separate model item and rendered
again on every model turn, so live course state never becomes frozen memory.

The upstream grok-prompts repository is AGPL-3.0. LingxiLoop follows its
template architecture and ordering but does not copy its prompt corpus
verbatim into this MIT project.

## Current module boundaries

- `server/src/modules/learning/preset.ts` is the single canonical six-role team and
  room definition; `onboardCompany.ts` only persists or refreshes it.
- `server/src/modules/learning/router.ts` and `classroom-router.ts` expose the
  authenticated HTTP boundary; policy checks remain in the learning domain.
- The renderer consumes real WuKongIM state and the server's read projection.
  Production learning paths contain no development store or generated fixture
  branch; tests inject fixtures at their own boundary.
- The retired Whispers observer/agent-side-channel surface, its old voice
  prompt, private-chat helper and one-shot whisper migration are intentionally
  absent. Canvas assignments and AgentOS work items are the only multi-agent
  collaboration path.
