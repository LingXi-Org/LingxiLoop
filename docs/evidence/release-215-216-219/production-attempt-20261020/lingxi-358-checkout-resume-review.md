# Independent scoped checkout and continuation review

Reviewed locally on 2026-10-20. No production/API request or production mutation was made by this reviewer. Root remains the sole executor. This supersedes the earlier continuation-only static review for the revised scripts below without changing that earlier review artifact.

Result: no P1/P2 finding in the reviewed operation. All three JavaScript files pass `node --check`. This is not a successful execution receipt: the exact pending metadata update must still reach `Complete`, `success: true` before either configuration write.

Reviewed SHA-256 identities:

- `set-release-checkout.mjs`: `5eaebeeebb6ea12c994d3cda5d4d212b44e570d3732b42dbce43265c481bb923`.
- `resume-komodo-adapter.mjs`: `5d7acd96090e9fb469923800c366bfb477bbc24d7574f8f9fba10ad6558d9a27`.
- `resume-maintenance.mjs`: `1c6da8ddc9c3c4f0edb5f28fba0e23814dc3d48f09270d77f3d0eb8293912ae0`.
- `RESUME-FAILURE-MODEL.md`: `2e42475bc5c9592eece0bc8fe964e12a552376a349e8eb55cecfb3e3ac717140`.

All four files are under `/tmp/lingxi-358-production/`.

Scope and failure review:

1. Checkout script lines 9–15 run the original full plan validation, resolve only the existing `release/production-358-20261020` remote ref, require its hash to equal the sealed plan's exact manifest commit, and verify known metadata update6ad76383e06d5e1f79836a3a by ID/operation/appA identity/terminal success and every target metadata field.
2. Lines 16–17 require the original pinned main/reclone configuration, expected inline owned checkout scope, idle procedure/apps and all four source writers stopped. The only requested configuration fields are `branch` and `reclone`; commit, repository, image, services, environment and security policy are not written.
3. Each partial UpdateStack call is preceded by fresh full configuration equality and idle checks. A transport timeout triggers readback rather than resubmission. Full configuration must then equal its previous value with exactly `branch` and `reclone` changed. Non-success HTTP or mismatch stops; no retry exists. Final success requires both configurations accepted by the release-branch adapter and all stopped container metadata unchanged.
4. Official Komodo2.3.3 `lib/git/pull.rs` locally cached at `/tmp/komodo-233-git-pull.rs` executes fetch, configured-branch checkout, rebase-pull of that branch, then exact commit reset. `clone.rs` deletes/reclones the owned checkout and also resets the pin. `pull_or_clone.rs` uses the existing checkout when present. A fixed branch equal to the pin therefore avoids reapplying the release's history onto the older main branch, while `reclone=false` avoids full cloning for every later operation. This is a code-supported rationale; actual checkout success still requires operation receipts.
5. Adapter diff against the qualified public adapter is exactly the absolute path for its Compose validator import and the explicit expected branch string. It validates actual state, rather than masking or rewriting returned API data. Mutation allowlists, target image/metadata checks, bounded waits, unknown-result handling and migration code remain identical. Its unused ordinary-rollout helper is outside this one-time continuation's call path; this adapter must not be reused as a general rollout module.
6. Revised continuation adds the completed, matching plan/branch checkout receipt requirement and uses this adapter. Original process absence, original attempt3 receipt/hash, no migration-event boundary, successful backup/restore, four unchanged stopped writer identities, two fresh exact-source zero barriers, qualified image checks, exact migration provenance, WebA/WebB/WorkerA/WorkerB sequence and individual readiness remain intact. It never restarts runtime3.5.6 after native13/product47 and never retries an unknown operation.
7. The original metadata operation must be allowed to finish before configuration mutation. Core's previously conflicted Compose cache may retain an error; this procedure does not claim that cache is repaired. Periphery operation success plus exact pinned image and metadata verification remain necessary.

Remaining operational prerequisites are concrete: known metadata terminal success, complete checkout receipt, then the continuation's fresh barriers. The review did not test or assert those live outcomes. No new credentials, security changes, global prune, data reset, replacement image build or paused3.5.3 soak changes are introduced.
