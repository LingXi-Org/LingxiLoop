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
- Full local dependency installation stopped with HTTP 401 for the locked
  `@lyyzka/lingxios@3.8.2` GitHub Packages tarball. The repository expects
  `NODE_AUTH_TOKEN`; it is absent from the local process. No token was created,
  copied, or persisted, and the rejected download was not retried. Full local
  build, typecheck, database integration and browser reruns are not claimed.

GitHub CI must validate the new candidate using its existing authorized workflow
configuration. This handoff does not authorize deployment or attest to a live
production version. Product 52 to 53 acceptance must precede a separate 53 to 54
release. Keep #304 and manual original-case issues #259, #260 and #264 open.
