# Isolated-lock #304 cloud acceptance

Status: exact dependency installation qualified; corrective browser/projection
execution pending. This receipt supersedes no result until those checks execute.

PR316 review identified44 mismatches among127 production direct dependencies in
the earlier shared underlay. That genuine25/25 browser run remains historical;
its source commit and root lock hash did not prove the installed dependency graph.
The [historical full inventory](locked-cloud-acceptance/historical-underlay-inventory.json)
records the actual drift, including development dependencies separately.

The corrective environment uses `npm ci --prefer-offline --no-audit --no-fund`
inside `/workspace/review-pr315`, through the existing command-scoped registry
authentication. It added1494 packages and exited0. No startup/latest refresh was
run, shared-root dependencies were not changed, no credential was persisted, and
production manifests/locks remained unchanged.

- [Before tool overlay](locked-cloud-acceptance/installed-before-tools.json):
  all153 direct dependency versions match their exact root-lock entries.
- [Effective browser graph](locked-cloud-acceptance/installed-before-browser.json):
  all127 production direct dependencies still match and resolve inside this
  worktree; the only two direct version overrides are the separately locked
  official `e2e@0.21.2` and `@e2e-dev/web@0.15.2` testing tools.
- [Installation receipt](locked-cloud-acceptance/installation-receipt.json).

Only the owning25 browser and8 projection checks are to be repeated. The native
report, clean candidate, actual dependency graph, screenshots and before/after
lock comparison will be recorded after execution. All data remains synthetic;
no production operation or original private-case acceptance is part of this work.
