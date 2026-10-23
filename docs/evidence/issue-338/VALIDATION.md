# Runtime patch provenance release qualification

This change supplies a generic same-schema runtime patch path. No production
operation, user data or private operational receipt is included in this evidence.

Local checks on 2026-10-23:

- `npm run server:typecheck`: passed with a fresh dependency installation.
- `node --import tsx --test server/src/__tests__/runtime-patch-profile.test.ts`:
  3 passed. Covers exact module/manifests/locks, unchanged capabilities/native hash,
  historical profile refusal and partial-history initialization refusal.
- The six owning host release, Komodo, source recovery, public-text, schema marker
  and transport test files: 111 passed. Covers one CAS after four stops/two zero
  barriers, pre-stop bound-run refusal, known source restoration through the real
  adapter, exact restored identity, committed-target refusal and uncertain no-replay.
- `server/src/__integration__/runtime-patch-provenance.test.ts` against an isolated
  local PostgreSQL 16/pgvector database: 4 passed, 1 explicitly skipped. Covers
  real transaction rollback, one-row CAS/replay refusal, a DDL-forbidding event
  trigger, unchanged business/history data, all 24 bound/checkpoint combinations,
  live-lease refusal and full54 empty initialization/startup/repeat behavior.
- `git diff --check`: passed.

The installed formal package for these checks is **3.8.2**. The CAS core test uses
synthetic source/target descriptors and unchanged actual native14 bytes. It does
not claim the 3.8.3 package was loaded. The partial-history integration case skips
under 3.8.2 intentionally. Before a new formal patch is released, the integrator
must run this same integration file and the owning migration suite with the actual
published package and exact root/server locks. That run must execute the new
empty-install stamp branch and the partial-history refusal case without substituting
the package version. Exact candidate CI and independent review remain release gates.

The provenance entrypoint proves the published package, both manifests/locks, full54
inventory, actual native bytes/schema, table presence, zero live leases and zero
incompatible unfinished runs. It changes only `lingxios_installation.runtime_version`
and `installed_at` in a bounded advisory/table-locked CAS transaction. Empty-database
initialization is separate; neither startup nor a repeated migration adopts a new
runtime version. Historical migration profiles and SQL files remain unchanged.
