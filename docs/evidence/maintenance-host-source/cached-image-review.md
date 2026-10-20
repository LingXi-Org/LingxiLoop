# Independent cached-image maintenance delta review

Reviewer `/root/maintenance_resume_review`, 2026-10-20. Scope: only the pending diff in `scripts/schema-upgrade-maintenance.mjs`, its owning test file, and `docs/evidence/maintenance-host-source/failure-model.md`, based on worktree HEAD `bf9c540664b47bef770443ea2e83c528ad3cdb73`. No production request, source preparation execution, service action, or Git reproduction rerun was performed.

**Decision: no P1/P2 findings.** Removing the preflight explicit PullStack calls is consistent with using already qualified images. The remaining `verifyImages()` checks both hosts through fixed InspectImage requests, requires the target repository digest and valid image ID, and remembers each host's image ID for subsequent comparisons. Missing images, invalid inspection replies or mismatched digests throw before the first StopStack. The check after backup and the checks before each deployment remain unchanged.

Both nodes' DB-free metadata qualification still follows initial image inspection and precedes draining. Source-file guards, zero-writer barriers, backup verification, uncertain-outcome handling, exact migration verification and ordered healthy deployment are unchanged. Required fetching must be a separate online preparation action using the existing approved mirror, rather than an implicit fallback inside this maintenance preflight.

The new test makes the fixture's pull method fail if called and requires the complete maintenance flow to succeed without a pull call. The retained red receipt has 23 passes and one failure at this new assertion before the implementation change. Existing image/metadata mismatch tests still prove failures prevent stopping.

This only removes explicit preflight PullStack requests. It does not override Compose `pull_policy: always`, the configured auto_pull behavior during a later explicit deployment, registry authentication/availability, or mirror behavior. The reviewer suggested making the implementation comment say “does not submit explicit PullStack” rather than “never re-pulls”; this is a wording clarification, not a blocking defect.

Independent local validation:

- `node --test scripts/schema-upgrade-maintenance.test.mjs`: **24 passed, 0 failed**.
- Receipt: `/tmp/lingxi-358-cached-image-delta-review-test.log`.
- `git diff --check` on the three reviewed files: passed.
- The parent's broader 55-contract run was still in progress when review was requested; it is not claimed as an independent result.

Reviewed file SHA-256:

| File | SHA-256 |
| --- | --- |
| scripts/schema-upgrade-maintenance.mjs | `ac417e4ed49e4458d49d6af5d373d544e88b60026bdd0fa182e1a616c5c92a81` |
| scripts/schema-upgrade-maintenance.test.mjs | `467f109fa93847250f022d5133033836621776112ed9594736bde5ece6567374` |
| docs/evidence/maintenance-host-source/failure-model.md | `de622b6e937061f9849b4495d6c39d05f98057f6bc312753be98cb9d4fbba9a6` |

This addendum supersedes the corresponding three file hashes in the earlier implementation review only. It does not review or certify the newly reported direct-host preparation driver/session, nor claim any online result. The qualified application source remains `d1075e35e16721979b484c2d9e33eeb56468ce9d`.

No action was denied and this reviewer has no uncertain production action because it submitted none.
