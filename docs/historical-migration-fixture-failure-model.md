# Historical migration test isolation

Recorded before implementation. The current patch package intentionally refuses
partial old histories; historical upgrade coverage must still execute in full.

- Never substitute `releaseVersions`, alter production locks, relax production
  migration checks or silently skip old upgrade tests.
- Run the five historical migration files with the actual officially published
  3.8.2 package. Pin its existing tarball and integrity; reject changed bytes,
  missing registry access or an unexpected actual loaded version.
- Use a new temporary directory, copied current source and fixture-only exact
  manifests/locks. Resolve the old package locally there, while borrowing other
  existing test dependencies read-only. Never copy tokens or write credentials.
- Use existing npm environment authentication, no lifecycle scripts and bounded
  download/execution. Clean only the temporary directory owned by this invocation.
- Reject non-test or non-local database targets and arbitrary test filenames before
  installing or spawning. Preserve nonzero child exits; run both requested groups
  and report current/historical groups separately.
- Any historical selection also runs the current package's fresh full54, repeat,
  partial-history refusal and no-mutation checks. The actual new package must run
  those cases without skips; old fixture execution cannot satisfy this gate.
- CI uses the existing integration command and existing selector-test check. No
  second production runtime dependency, new workflow, credential or schema write
  outside local/CI disposable test databases is introduced.
  The existing integration step receives the same package-read token already used
  by its npm install step; no token is persisted or new permission requested.

Local verification on 2026-10-23: selector/boundary tests 4/4; server lint and
typecheck passed. The verified physical 3.8.2 fixture passed 43 tests in the four
historical migration files and the presentation file passed 1/1 after copying its
shared frontend parser source into the fixture. The current-package group loaded
the actually installed 3.8.2 and passed 4 tests with its newer-package-only case
explicitly skipped. The final dependency integration must run the same command
with actual formal 3.8.3, yielding all 5 current cases without that skip plus all
44 historical cases under the separately verified 3.8.2 artifact. The two historical
version comparisons use `String(releaseVersions.runtime)` solely to accommodate
the published package's literal TypeScript declarations; their runtime value and
the production refusal/stamping conditions are unchanged.
