# Bounded instruction comparison

Date: 2026-10-24. Historical task: [PR237](https://github.com/LingXi-Org/LingxiLoop/pull/237),
removing an unused musl Canvas binding from a Debian/glibc server image while
retaining the GNU binding and formal runtime PDF support.

## Protocol

Both isolated worktrees start at `fe61654b76c6cc47f70351ad04f2c4819d9111b8`.
Both agents use **gpt-6.1-sol / medium**, fresh context, the same prompt except
for their worktree path, a requested budget of 8 tool calls / 180 seconds, read-only source
inspection and temporary verification files. Neither may install dependencies,
contact a model/production service, inspect the other arm or change source.
These equal restrictions keep the experiment bounded; they also limit what it
can establish about unconstrained development.

The prompt reconstructs the task from the public PR description; it is **not
the original private session prompt**. The replay assesses the completed
historical candidate's verification, not end-to-end implementation or release.
The current OS 3.8.11 model qualification is not replayed.

Arm A keeps historical AGENTS.md unchanged. Arm B changes only:

```text
A: Highly prefer E2E tests as the sole testing mechanism. Use them to verify complex features work. At the end of E2E tests, produce a verifiable and repeatable artifact.
B: Choose the smallest check that exercises the changed behavior. Use E2E for multi-step product flows and retain a reproducible result.
```

All other historical files are unchanged. After the replay A was clean; B had
only this one-line AGENTS diff. Evidence packaging after completion is separate
from the replay's tool count.

## Observed results

| Measure | A | B |
| --- | --- | --- |
| Tool calls | 6 exec calls / 6 shell commands | 6 exec calls / 6 shell commands |
| Static checks | Both changed JS files parse; commit whitespace passes | Same |
| Executed refusal fixtures | Wrong version, layout, invalid action preserve file | Wrong version, layout, loader hash, missing args, invalid action preserve sentinels |
| Boundary review | Platform, pins, Docker wiring, retained GNU/PDF path | Same, plus explicit runtime PDF consumers |
| Completion judgment | Requires exact-image GNU/PDF verification | Same |
| Unnecessary E2E / live model run | None | None |
| Full task runtime, tokens, cost | Not exposed/measured | Not exposed/measured |

Detailed commands and outcomes: [A](a.md), [B](b.md).
Both lacked installed historical dependencies and an exact candidate image.
Both accurately marked successful deletion, real native rendering and runtime
PDF extraction as unrun, and distinguished old documented evidence from new
verification. Neither widened permissions or changed production/source.

## Decision and limits

This single pair supports **no observed loss of boundary awareness** under the
shorter, behavior-based instruction. It does not demonstrate a cost or latency
improvement, and the small difference in fixture count is not a quality ranking.
The old instruction did not visibly misdirect A in this bounded task.

Adopt B to reconcile the existing "smallest owning check" guidance with the
current requested risk-based verification policy, using positive, concise text.
The separate regression-before-implementation and failure-mode instructions are
combined without changing their intended ordering. Expired session authority
is archived independently of this comparison.

An exact original-session implementation replay, billing/token comparison and
repeated-task generalization remain unverified. No savings estimate is inferred
from tool count or the 180-second cap.
