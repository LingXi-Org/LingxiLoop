# Locked dependency acceptance failure model

Recorded before the corrective browser rerun for PR316 review P2. Product source
and production manifest/lock bytes remain those of main58c1a214 including PR315.

- A source commit and matching root lock hash do not prove the installed browser
  dependency graph. The historical shared underlay had44 mismatches among127
  production direct dependencies (54 among all153 direct dependencies). Its
  genuine browser reports are historical tooling runs, not production54
  dependency acceptance.
- Run root `npm ci` only inside this isolated worktree using the existing
  command-scoped registry authentication. Do not run startup/latest refresh or
  change the shared root, manifests, lockfiles or persistent credentials.
- Before tool substitution, require all153 direct installed versions to match
  their exact root-lock package entries. Record all127 production direct package
  versions, lock versions and real installed paths, not just selected UI examples.
- Substitute only the separately locked official `e2e` and `@e2e-dev/web` tools.
  All127 application dependencies must still match the production lock, resolve
  within this worktree and remain unchanged before and after browser execution.
- Rerun only the owning25 official browser cases and8 projection checks. A
  fixture or product failure must be reported on this qualified dependency graph;
  do not reuse a previous green report to fill a new failure.
- Bind the new clean candidate, actual dependency inventories, exact tool locks,
  native report and unchanged screenshots by hash. Preserve old reports and mark
  their dependency limitation explicitly rather than rewriting their history.
