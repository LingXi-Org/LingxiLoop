# Combined 215 / 216 / 219 release qualification

Candidate: LingxiLoop 5eacff3cb3935a4b72828c3e7de5d60dcf72a4bf and
LingxiOS 1555d31b67f26158d6431317634dff48cb5c075c (same tree as PR36).

Failure cases recorded before integration adjustments:

- Existing migration tests stop their expected result at 0047, although the
  combined candidate contains the real immutable 0048. Run these unchanged
  first and retain the actual failures before adjusting their final-state
  expectations. Preserve historical schema-12 intermediate assertions.
- A 46-to-48 upgrade must execute the real 0047/native015 transaction before
  0048; old product rows, migration checksums, runtime provenance, and repeated
  no-op behavior must remain correct.
- Active Worker leases and Web capture claims must reject the schema upgrade.
  Production schema13 requires verified writer drain and a restored backup.
- Current authorization, epochs, revision and forget fences must cover public
  text attempts, terminal history, new conversations, and memory inheritance.
- Native editor private recovery data must not enter teacher/model payloads.
- A local source tarball is preparation evidence only. The release requires the
  actual formally published package, exact root/server locks and merged CI.
- Keep the actual provider's original unowned 207-second Abort unresolved.
  One successful bounded flow does not establish a general latency improvement.

Only new loopback test databases are used below. No production credentials,
existing author fixture databases, or shared installed dependencies are changed.

The first updated 34-test run passed 32 and failed 2. One retained explicit
ledger expected-list also needed 0048. The new old-content test exposed a real
no-op defect: `applyRuntimeUpgrade` rewrote `lingxios_installation.installed_at`
even when all package/schema fields already matched. Preserve that timestamp
when provenance is unchanged, while retaining real version/schema/hash updates.
The failed 0048 transaction correctly preserved the prior installation row.

The source12 maintenance fixture then failed against the candidate3.5.8:
it loaded the current `schema` resource (native13), but correctly expected12.
Use the immutable public `schema012` resource and verify its exact source hash
and installed schema12. Keep the actual13/47/48 classification assertions.
Write each new fixture receipt exclusively to a fresh output, preserving the
previous committed source12 evidence.
