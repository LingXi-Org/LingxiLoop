# Direct-copy source correspondence checker — prepared, not image-qualified

`check.py` is independent of the frozen OCI auditor. It reads an already verified audit receipt and merged rootfs inventory, then hashes exact Git blobs locally. No registry, Docker, npm, database, provider or production call is made, and no worktree/ref is changed.

After the coordinator obtains the **actual final image's successful** OCI audit, run:

```bash
python3 /tmp/lingxi-225-219-preparation/final-image-source-check/check.py \
  '<verified-audit-output>/receipt.json' \
  '<verified-audit-output>/rootfs-inventory.json' \
  /workspace/LingxiLoop-integration-215-216-219 \
  '<actual-final-40-character-source-commit>' \
  '/tmp/lingxi-225-219-preparation/final-image-source-check-result-<unique-run>'
```

The output directory must not exist; its parent must exist. Placeholders intentionally fail validation. Do not substitute an earlier commit based on an older green run. The local source policy was reviewed at `d1075e35e16721979b484c2d9e33eeb56468ce9d`; any later exact source commit with identical Docker COPY/dockerignore policy is accepted for comparison, but source equality is still checked against that **later** Git commit.

## Preconditions and exact scope

- Require `receipt.passed === true`, its `inventorySha256` equal to the exact input file bytes, expected repository and valid immutable index/amd64/config digests, and `sourceCommit` equal to the supplied full commit. The commit must exist locally as that exact Git object. This is conditional on the audited input receipt; it does not independently authenticate or sign that receipt or fetch remote blobs.
- The reviewed final Dockerfile and Dockerignore are pinned by SHA256 in the tool and `reviewed-copy-policy.json`. A policy change fails with `copy_policy_requires_review`, even if the files otherwise match the image; update this narrow tool only after reviewing the changed COPY/exclusion rules.
- Every tracked file expected from the final `COPY server`, selected `src/lib` files, two Visualize domain/shared subtrees, parser helper, and selected ZCode skill/runtime/license/provenance sources is required. The pinned exclusions for test sources/logs/dependencies/caches/local environment directories are applied. This does **not** expect the whole SPA source tree in the final runtime stage.
- `app/package.json` and `app/package-lock.json` map to `server/package.json` and `server/package-lock.json`. Direct copies also retain those files under `app/server/`.
- Every expected source path is compared by SHA256 and byte size against its Git blob. Regular/hardlinked image files must match file bytes; a tracked symbolic link must match the Git link-text blob. No content or link target is emitted by this checker.
- Require exactly48 sequential tracked `.sql` migration files, all matching in the actual inventory. Web `server/src/bin/web.ts`, Worker `server/src/bin/worker.ts`, migration `server/src/migrate-bin.ts`, and `src/lib/participantDisplayName.ts` must all be present and match.
- Unknown extra paths within `app/server`, `app/src`, or `app/third_party/zcode` fail, including unexpected empty directories. Missing or mismatched expected paths fail. The sole untracked exception is `app/server/assets/visualize-runtime/**`: regular generated files are listed as `generated_uncompared`, not claimed Git-matched. Tracked files there, if any, would still require exact source matching.
- SPA `app/dist`, installed dependencies and base OS entries are explicitly outside this direct-copy source scope and counted separately. Their whole-image/asset/package inventories and actual readiness/isolation remain separate gates.

Git uses argument arrays with no shell, no replace refs, no global config, and no optional locks. One local `git cat-file --batch` process streams each blob into SHA256. Stderr/body content is never printed or written; the checker closes its owned pipes/process. Limits are96MiB input metadata,64MiB per Git blob,256MiB total distinct source blobs and a120-second overall deadline.

## Results and local evidence

`source-check.json` contains only identities, paths, sizes, hashes, match counts, explicit issues, generated/uncompared paths and critical-entry status. Unknown/missing/mismatched paths produce `passed:false` and exit1. Invalid receipt/hash/Git/policy inputs produce a fixed-code `failure.json` and exit1. Accept only process exit0 **and** `source-check.json.passed:true`; file existence alone is not success. Readiness, isolation and production are explicitly not tested/accessed.

`local-tests.log`: **9/9** tests pass using one small temporary Git repository and synthetic inventories. Coverage includes exact direct copies and all48 migrations, root package mapping, generated/uncompared classification, wrong source commit, failed audit receipt, invalid raw inventory hash, missing migration, changed source hash, extra unknown file/directory, symbolic-link mismatch, policy mismatch, and the actual command-line success/failure paths. The temporary Git repository is removed after the tests. Initial eight tests passed but exposed an unclosed reader warning; `local-tests-initial-warnings.log` is retained and the final pipe cleanup run is clean.

`d107-source-plan.json` is **source-side preparation only**, not actual image verification:521 expected image paths,519 unique Git files,4109985 logical copied bytes,48 migrations and all four critical files. Its hashes were read from local Git objects at d107. No final OCI receipt or rootfs inventory has yet been provided to this checker. Do not reinterpret these counts as final image bytes, runtime readiness or a completed source match.

The original OCI auditor remains unchanged at SHA256 `2507419a202bec96f4566a1c2bd62c584a128d52f8cb81d913ac6f56ae7aaf6f`. This delivery is confined to this `/tmp` directory; no product/runtime code, tracked configuration, package lock or production resource was modified.
