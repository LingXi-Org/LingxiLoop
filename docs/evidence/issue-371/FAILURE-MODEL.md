# Integration selection failure model

Before implementation, preserve these failure cases:

- No arguments or an empty CI file list accidentally starts every test and the historical package fixture.
- Explicit selected mode with no files, malformed JSON, unknown modes/files, traversal or conflicting full/file options silently falls back to a different suite.
- Missing database or Redis configuration exits successfully, leaving required CI coverage unexecuted. A test-looking credential or host must not authorize TRUNCATE on a non-test database.
- A failed, timed-out, signalled or unspawnable child is treated as success; later historical work hides an earlier current-package failure.
- Selection omits changed tests or the owning migration/authorization/runtime compatibility checks, or deletion-only changes expand to all tests.
- Timing output combines installation, queue, model qualification, image publication and test execution into an invented speedup. Each executed file/group must retain its exit status and measured wall time.
- Increasing concurrency corrupts tests sharing TRUNCATE fixtures. Keep serialization and reduce scope instead.

The default is a named, small real PostgreSQL/Redis smoke set. Heavy and historical tests remain accessible with explicit selected/full modes and relevant change routing. No production provider request is needed to validate this change. Scope and runner failure behavior have focused regressions; the selected real tests establish retained product boundaries.
