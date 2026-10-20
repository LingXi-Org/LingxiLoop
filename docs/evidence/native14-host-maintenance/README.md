# Native14 release driver evidence

Scope: `host-release.mjs` / its Komodo adapter, the shared native transport,
source backup planner/adapter, existing deployment CI contract and runbooks.
No product migrator, migration SQL, package lock, live plan, credentials,
production state, image or frozen52ee/9a5 checkout was changed.

The failure model and initial contracts preceded implementation in
`fae85d6f`. Its author/committer name is leecyang, but the first test commit
accidentally used `leecyang@users.noreply.github.com`. History is retained;
subsequent commits use the existing verified
`164771957+leecyang@users.noreply.github.com` identity.

The execution environment disconnected during implementation and its `/tmp`
was lost. Initial red logs and the original read-only research report are
therefore not available as artifacts; they are not reconstructed or represented
as preserved. Git retains the first failure model/tests. On recovery, status
confirmed only the backup and shared transport edits had landed; the two host
release implementations had not. No green result from the uncertain command
was claimed. All files below were produced after recovery and remain in the
workspace.

- `first-green-attempt.log`:36/41. The five failures revealed a test fixture
  still selecting49 instead of its declared native14/product50 target; fixed
  the fixture without weakening the boundary.
- `terminal-consistency-red.log`:11/14. Added contradictions in fresh terminal
  success/timestamps and undocumented native status before tightening guards.
- `ci-ownership-red.log`:0/1, before putting source-bound backup contracts in
  the existing deploy-contract job with historical Git objects.
- `core-and-ci-review-red.log`:16/19. The independent reviewer caught numeric0
  being falsy in the GitHub Actions checkout expression; use strings'0'/'1'.
  The other failing cases require backup submission to retain the Core ID
  already qualified by the host guard.
- `contracts-green.log`:75/75,0 skipped, across the six existing owning suites:
  schema-upgrade-maintenance, schema-upgrade-host-source, host-release,
  host-release-komodo, host-release-transport and verify-memory-backup.

All local service calls in these contracts are synthetic transports. Existing
source commits are read only to derive exact manifests/locks/migrations.
The harmless timeout test verifies process-group cleanup without a database.
There were no production API/SQL requests, actual backup/restore, dependency
installation, image pull, browser or provider checks. Existing backup SQL and
restore algorithms are retained; the new profile selects the actual source13/
49 provenance. The real native13 source restore, formally published3.6.0
package/OCI/CI, product native016/0050 integration and eventual production
acceptance are **not** established by these synthetic results. Root coordinates
the required fresh source backup at the actual release, not this development
branch.

The deployment job now runs the backup contracts as well as its existing
suites. Only that job checks out complete Git history for the existing fixed
historical fixture commits. No additional CI matrix/job was added.

## Exact-head CI follow-up

Initial PR257 run39472663324 on5619332c finished98/99; the only failure was the
unknown-status test starting its100ms cancellation timer before offline Git
plan validation. CI validation took295ms, so the test aborted before any
native request. The timer now starts at the synthetic RunStackService reply
with a1s safety ceiling; the same assertions still require no cancellation,
no poll and no retry. Production scripts are byte-identical to independently
reviewed5619332c. `backup-timer-green.log` records the affected12/12 suite after
this test-only correction. The earlier75/75 remains attributed to its original
run; do not label the failed remote run green.
