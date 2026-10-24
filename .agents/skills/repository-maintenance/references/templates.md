# Maintenance records

Keep the record proportional to the change. Link existing evidence rather than
copying old reports. Mark each entry **observed**, **estimated** or **pending**.

## Candidate / deletion evidence

| Location / owner | Current purpose | Consumers and history | Decision | Benefit / risk | Owning check / rollback |
| --- | --- | --- | --- | --- | --- |
| path / owner | behavior | direct, dynamic, external, data/recovery evidence | confirmed / pending / retained | measured or estimated with assumptions | command and restoration point |

## CI opportunity

| Change | Comparable runs / window / sample | Current wall / runner / failure rate | Expected runner minutes saved per day | Coverage / uncertainty |
| --- | --- | --- | --- | --- |
| bounded change | links; event/scope/attempt/config | checks separate from images, deploy and queue | observed frequency × per-run estimate; label extrapolation | behavior retained; missing data |

## Instruction comparison

- Historical task source and exact/reconstructed prompt; snapshot; one changed instruction.
- Same model/effort, environment, budget and permitted actions for both arms.
- Results: correct behavior, omissions, unnecessary actions, tools, tokens, time and cost.
- Unavailable measurements, sample size and task restrictions; decision supported by the result.

## PR / release record

- Problem and resulting behavior; consumer evidence; precise diff and benefit.
- Checks: command, commit, environment, result (passed / failed / skipped / pending).
- Independent review: reviewed head, findings and resolution.
- Rollback point and effect on data/protocols; authorized integrator and required release state.
- Final receipt links when applicable; remaining issue acceptance items.
