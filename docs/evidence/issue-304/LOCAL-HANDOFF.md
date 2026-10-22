# Local recovery of the reviewed #304 source

This note supplements the historical cloud receipts in this directory. Their
test results describe the original cloud execution, not a new local execution.

On 2026-10-22, the designated local integrator recovered the handoff onto
`d5481cd258058784e7004169b5ef1235460384f1`. The source branch ended at
`bacef45ee4fcd574f17611927c902b76611d73f4`; its reviewed product source was
`0960df6da0c83cff2d8461886f7ad42ec66ccfa1`.

- Handoff ZIP: `LingxiLoop-issue304-handoff-bacef45e.zip`, 546123 bytes.
- SHA-256: `4bafc3cae666be075e365c9ede342695002a743b96b7bfcf4b0c4219351e0818`.
- All 119 included files match the handoff manifest byte for byte.
- The restored source tree is `87d7e3e40534006b8fdce24f42be169d5da1e96d`,
  matching the filtered handoff tree exactly before this supplemental note.
- The 23 binary/image evidence files were intentionally excluded. Screenshot
  references in the historical browser receipt therefore do not provide local
  image artifacts. The original cloud branch retains them.
- Recovery creates a new Git commit; it does not recreate the original SHA or
  rewrite historical authors. New local Git operations use `leecyang`.

Local verification:

- Release offline tests: 67 passed, 0 failed, 0 skipped. The first run had 6
  failures because Windows CRLF conversion changed the pinned seed SQL bytes.
  Restoring the exact Git blob resolved those failures without changing the
  checksum guard, assertions, SQL content, or release behavior.
- All 223 pinned visualization inputs passed verification.
- `git diff --cached --check` passed for the recovered source.
- The initial dependency installation lacked `NODE_AUTH_TOKEN` and received
  HTTP 401. After explicit approval, one npm child reused the existing local
  `leecyang` credential in memory; installation completed with 1484 packages.
  No credential was printed, saved, created, or sent to the cloud executor.
- Web tests: 120 passed, 0 failed, 0 skipped; web typecheck passed.
- The fresh Git checkout byte regression failed before the attributes change
  and passed afterward. Seed SQL is pinned to LF and vendored content to exact
  bytes; historical migration hashes remain unchanged.
- The initial PR CI run `39753599034` failed two Web fixture assertions and ten
  server integration cases. The owning local integration files now pass all
  eleven tests: six historical migration cases, research authorization, two
  Worker stream/repair cases, native memory, and three-mode skill loading.
- Historical migration tests now supply their exact migration prefix rather
  than accidentally including later product 54 DDL. Existing assertions remain.
- The native-memory fixture includes the host summary tool in its exact tool
  set, while preserving independent review, stale-write and authorization checks.
  The skill-loading fixture uses its existing synthetic 256k capacity for every
  mode, with an explicit conservative byte-budget assertion. At 128k, the
  measured 111921-byte input plus output/protocol reservation exceeded the hard
  limit. Production model configuration and budget checks are unchanged.
- A real Windows directory-walk error was exposed by the owning integrations:
  starting at `\\` duplicated the drive (`D:\\D:`). The walk now starts at the
  parsed filesystem root and still rejects symbolic links at every descendant.
- The isolated test copy was byte-verified against 8066 tracked/new inputs.
  Its visualization runtime build passed. It avoids an unrelated ancestor Yarn
  PnP configuration without modifying user/global package-manager settings.
  Fresh browser or live-provider acceptance is not claimed.

GitHub CI must validate the new candidate using its existing authorized workflow
configuration. This handoff does not attest to a live production release.
Product 52 to 53 acceptance must precede a separate 53 to 54
release. Keep #304 and manual original-case issues #259, #260 and #264 open.
