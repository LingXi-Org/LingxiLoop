# Independent restore review — isolation correction

Reviewed 2026-10-20, read-only, fixed source
`873f9fd311f01de2df294cde11586dc8f012ffde`.
This is a delta review against previously reviewed
`2a57d68b895ccb26dc06a65a0adb19324273bb3c`, not a rerun.

**Conclusion: the prior URL-isolation P2 is resolved. No remaining P1/P2 was
found in the reviewed correction and prior rehearsal scope.**
The initial finding remains recorded in `independent-restore-review.md`; its
unresolved status applies only to the earlier source revisions.

## Correction

- `scripts/independent-memory-restore-url.mjs:4–20` requires PostgreSQL,
  literal loopback host, postgres user and a nonempty validly encoded password,
  rejects query/fragment, and restricts the credential-template database.
- `:22–28` creates a new fixed URL, copying only the test password; host/user are
  fixed, port comes from the owned Docker endpoint, and the database must match
  the generated source/target pattern (or the parent's postgres administration
  database). Port 55432, invalid ports and database suffix injection are rejected.
- `:30–34` revalidates the subprocess connection before importing application
  modules. The child cannot accept query overrides, shared port 55432, foreign
  host/scheme or an administration database.
- The parent uses this constructor for its own pools and child DATABASE_URL.
  It validates the template before creating an output directory or Docker fixture.
  No arbitrary input URL options or environment credentials are forwarded.

No migration, package, product/runtime implementation or existing ownership
cleanup behavior changed in this delta.

## Exact evidence checked

Read the author's pure-parser red program and both logs:
`/tmp/issue216-independent-restore-url-boundary/{old-parser-red.mjs,red.log,green.log}`.
The original operations reproduce effective host/port override with the actual
installed pg parser: 0/2. The fixed tests cover the reconstructed endpoint and
encoded password, both entry points rejecting overrides/fragments, invalid/shared
ports, foreign databases, hosts and schemes: 3/3, 90.513 ms.
These programs do not instantiate a pool/client or open a socket. I did not rerun
them or any Docker/database operation.

Formal-package receipt:
`/tmp/issue216-independent-restore-guarded-formal/receipt.json`
SHA256:
`72a8a7f8fc4a0eb225595bfbe6b78402f25137674903a52945b44d5ec732ea92`.
Its targetCommit is exactly 873f9fd3. Independently hashing the three fixed Git
blobs gives precisely the recorded driver hashes:

| File | SHA256 |
| --- | --- |
| main | `09382470be8c10867cbce7ad703f48b0e8805f5fd7a43ca926ab2dc881dea5dd` |
| step | `8db7edd1de3dcb6cb0de4b8ca72f89cbc61ce41689d85b47043c1ffb6c3711e9` |
| URL guard | `cc5fcda6b99233a1f94a6e53a99b293084e31cf1deecbf9782a128ed1eab0fcb` |

The recorded actual PostgreSQL 16.15 run took 23.243 seconds, passed all five
phases, and used formal 3.5.6/native12/product46 source and formal
3.5.8/native13/product48 target. All 174 restored table counts/hashes match;
171 old-column table hashes remain equal after upgrade. The source/restored
aggregate hash is
`7a0cc76167492643cb385ea8c4f19141b66bc38fb6f52475d0bcea5b6f363c14`.
The receipt preserves successful 47 commit / injected 48 failure / repair of
48 alone, old-instance startup refusal, backfill authorization/CAS/deletion
controls, zero per-phase fetch attempts and all four cleanup flags true.

The target package SHA256 remains
`ee308270402b220452f8eb4e92e9c1d25a68466525f21827203bd5078a9c1bcb`,
registry gitHead `35ac1208fcf2bd6cb1852f474175e9eb7e2083ec`.

## Remaining scope

This closes the reviewed connection-guard issue. It does not turn synthetic local
restore evidence into production backup, drain, already-running old-writer
termination, external-service consistency, live-provider or long-soak evidence.
The existing production requirements and compatible fix-forward boundary after
47 remain unchanged.

Final evidence head `d55d2034e6b561bd5e658a5f724f6f25b205436f` was subsequently
checked directly from Git objects: all 25 changed files relative to 873f are
under this rehearsal's evidence directory, all 25 SHA256SUMS entries match,
the committed formal receipt retains exactly the hash above, and the working
tree is clean. No implementation changed after 873f. The no-remaining-P1/P2
conclusion therefore applies to this final evidence head as well.
