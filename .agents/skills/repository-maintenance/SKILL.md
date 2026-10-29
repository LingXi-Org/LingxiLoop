---
name: repository-maintenance
description: Maintain LingxiLoop with consumer evidence, small reversible changes and measured verification. Use for cleanup, dependency/config retirement, CI cost and development-instruction changes.
---

# Repository maintenance

Start from the current issue, repository instructions and a fixed commit. Keep
the current session's scope and file ownership explicit. Use this workflow for
maintenance changes; use [repository-review](../repository-review/SKILL.md) for
an independent read-only assessment.

1. **Establish the baseline.** Read related issues/PRs and existing evidence.
   Record the commit, environment and owning checks. Reuse available measurements.
2. **Trace consumers.** Follow imports, explicit registries, dynamic names,
   build/runtime entries, external consumers and history. Include old data,
   migration/recovery paths and operational controls. Classify each candidate as
   confirmed, pending or retained, with its evidence, owner and expected benefit.
3. **Choose one bounded change.** Rank net benefit against risk and verification
   cost. Keep uncertain candidates intact. Document the failure modes and the
   small, reversible implementation before editing. Coordinate shared files.
4. **Implement and verify.** Preserve effective behavior coverage and run the
   checks that exercise the affected boundary. Prefer a representative existing
   check; add a regression for a real defect or explicit risk. Compare equivalent
   environments and scopes, retaining failed attempts as well as successes.
5. **Request independent review.** Provide the diff, consumer evidence, actual
   checks, measurement limits and rollback. Resolve findings on the final head.
   Prepare a small draft PR with a clear completion boundary.
6. **Feed back the result.** Update the candidate record and any reusable lesson.
   Use [operate-release-controller](../operate-release-controller/SKILL.md) for
   product releases and [operate-komodo-production](../operate-komodo-production/SKILL.md)
   for retained shared infrastructure. Close the issue after its
   required verification and release state are established.

For CI work, distinguish queue, check wall time, summed runner execution and
image/deployment time. Group historical runs by event, attempt, scope and
relevant configuration. Existing metadata collection is in
[`collect-ci.py`](https://github.com/LingXi-Org/LingxiLoop/blob/351e895a315bb46b9061c8628b20d9b9fa5ffa1e/docs/evidence/issue-201/collect-ci.py). Record sample
size and observation window; separate observed savings from projections.

For instruction changes, replay a real historical task from the same snapshot
with the same model/effort and a single instruction delta. Record quality,
actions and available cost/time measures. A bounded or reconstructed replay
should state its limits; a single pair is not a cost benchmark.

Use the compact [record templates](references/templates.md) and the
[validated cleanup example](references/validated-example.md). Keep permissions,
tenant isolation, durable effects, cancellation, migrations and rollback
contracts in the consumer analysis appropriate to the affected code.
