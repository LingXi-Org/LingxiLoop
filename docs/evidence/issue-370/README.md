# Issue #370 maintenance delivery

Baseline: `190930ffbd6d2f14d6d2430b6e41e0bdd2373bb9` (published Loop / OS 3.8.11).
Scope ownership: [issue comment](https://github.com/LingXi-Org/LingxiLoop/issues/370#issuecomment-6379849447).

The implementation removes one unreachable Web view and separates expired
session authority from stable repository guidance. The maintenance Skill is
derived from this reviewed cleanup, existing repository assets, and the bounded
instruction comparison. It gives later changes a small evidence/review workflow.

- [Candidate inventory](candidates.md): confirmed, deferred and retained paths.
- [Actual cleanup](cleanup.md): 99 lines / 2,993 bytes, reachability, history and rollback.
- [Historical CI sample](ci/README.md): existing runs, comparable groups and limitations.
- [Instruction comparison](replay/README.md): fixed snapshot/model, one instruction delta and observed limits.
- [Skill discovery replay](skill-replay.md): fresh reviewer found and executed the workflow from AGENTS.
- [Archived session context](session-20261019.md): history, not new release authority.

## Source and reuse decisions

The official [OpenAI maintenance article](https://developers.openai.com/blog/maintaining-software-with-the-gpt-6-family)
supports consumer/history evidence, small reviewed changes, measured prioritization
and controlled instruction comparisons. These are workflow ideas, not copied
implementation code or proof of savings in this repository. Its distinction
between unused code and operational safeguards informs the retained candidates.

Reuse `repository-review` for independent review, `operate-komodo-production`
for authorized release work, and `docs/evidence/issue-201/collect-ci.py` for
metadata collection. Earlier #201/#229 improvements are baseline assets, not
new gains. The new Skill links these owners instead of copying their procedures.

## Verification and completion boundary

Local validation (Node 24.19.0, exact unchanged lockfile): Web lint passed;
`npm run build` passed including typecheck; existing Web tests passed 128/128,
zero skips (22.286s). Vite's build phase was 36.87s; these are observations,
not before/after speed claims. Build emitted the existing large-chunk advisory.
Skill metadata and 11 local AGENTS/Skill reference targets validated. The first
install failed at the unavailable default npm cache; the task-owned temporary
cache install succeeded without permission, credential or dependency changes.

The deletion's independent reachability review found no P1/P2 issue. A fresh
reviewer discovered the Skill through AGENTS and executed its consumer/history,
validation-record and rollback workflow; see the replay above. Final
committed-head CI and full-diff review are tracked in the PR linked from #370.
Local Node 24 checks do not replace the repository's Node 22 CI result.
No manifest/lockfile, runtime package, database schema, CI selector, test runner,
default list or historical fixture is changed by this branch.

#371 owns test deletion/consolidation and the measured CI improvement. Its
before/after result is an integration dependency for the corresponding #370
acceptance item; this branch does not claim a speedup from historical samples.
Merging, deployment and issue closure remain with the designated integrator.
