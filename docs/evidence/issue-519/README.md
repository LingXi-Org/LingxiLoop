# #519 — graded homework checks and teacher-selected criteria

Implemented against main `b9e6d169f0a0e94d7b674f4100502e39b1f2503a`.

- Grounded findings distinguish blocking inconsistencies, optional suggestions and teacher-only judgment. Legacy ungraded rejections stay blocking; malformed/ungrounded results stay technical errors. Required materials and authorization checks remain in place.
- The validation worker supplies a complete criterion alternative, observable student evidence, remaining teacher judgment and any coordinated task edit. Each alternative can be edited, filled into the existing native editor, or declined. Only the selected block is replaced; the teacher saves and the existing worker checks the new revision. No silent changes or automatic publishing.
- Keeping teacher-only criteria requires explicit confirmation enforced by the publish API. Frozen findings accompany the published task into assessment; host code prevents automatic mastery claims for those criteria and labels them “待教师判断”. Existing student evidence/submission and teacher review mechanisms remain the owners.
- Migration `0058_homework_validation_findings` adds one JSONB column with an empty default, using the existing transactional runner and locked runtime checks. No dependency changes. Requires the formally published, already locked LingxiOS `3.8.12` and migrations through 57.

## Local verification (2026-10-26)

Exact root `npm ci --ignore-scripts` succeeded with existing authorized package access; stale preinstalled server dependencies were moved out of resolution. No replacement runtime or credential file was introduced.

- 14 focused tests: validation parsing/grading and grounded alternatives; manual mastery boundary; suggestion presentation/stale controls; existing error/retry/publication display.
- `homework.test.ts`: 50/50 passed. Two #519 scenarios exercise proposal → unchanged saved draft → teacher edit/save → PENDING/stale publish rejection → new check → publish → student report using final criteria; and manual criteria → missing-confirmation rejection → non-owner rejection → confirmed publication → report → student submission retaining the teacher-review boundary. Existing material, system-error, revision, tenant/ACL and submission regressions passed.
- `homework-findings-migration.test.ts`: 1/1 passed. Real local PostgreSQL upgrade 57→58 preserves five legacy validation states, content and runtime provenance; repeated migration is a no-op.
- Fresh local migration 1→58 and a second no-op migration passed. Dedicated containers bound to localhost: PostgreSQL port15519/database `lingxiloop_519_test`, Redis port16519. No production database was used.
- Web/server typechecks and focused Biome lint passed. Production Web build passed. No browser execution.
- One bounded independent read-only Astra review found no actionable issue in the implementation diff; it did not claim browser/model acceptance.

The initial focused regression failed against the old ungraded parser before implementation. Early verification failures came from stale preinstalled runtime resolution, missing local test environment settings and a test fixture that requested a report before saving an answer; these were corrected before the passing runs above.

## Acceptance limits and integration handoff

The API tests use explicitly scripted model responses and synthetic tasks. “Handwritten” and “generated” fixtures prove the common saved-draft path, not real system generation quality. The screenshot's original full six-question/seven-blank task and raw model input were not available; the fixture covers the distinction between 1024 total addresses and 1022 assignable hosts, but does not prove the original screenshot was a false positive. Real model consistency after accepting a proposal, original-task quality, native-editor browser interaction and live teacher/student acceptance remain unverified. Alternatives are proposals, not a promise of a future model verdict; the latest saved content is always checked again.

No scheme-B capability picker, production write, student message, merge, deployment or new credential. No #515/#518 work was incorporated. #510 is not a dependency; only the shared homework contracts file overlaps, at different definitions (publish/judgment here versus submit references there). Preserve both during integration.

Hand off solely through the parent to #514 task `01a176cd-9849-7052-b3c6-b27472333039`. Recheck main and migration numbering if another schema PR lands first. Exact-head CI is reported in the draft PR / task handoff; local results alone do not authorize rollout.


## Product58 preparation on the qualified SDK14 batch

The existing PR521 is integrated after PR520 `0047c302e1d9bf47b43278713a6c374b759b03a9` (formal SDK3.8.14). PR520 and its strict CAS57 implementation remain unchanged. All57 existing SQL files and the complete published package locks are unchanged by this second phase. The three shared application files merged without text conflicts; both #510 submission references and #519 explicit teacher judgment confirmation remain present.

Adding0058 exposes a real fixture boundary: the production CAS57 correctly refuses a58-migration checkout. The test runner now isolates its exact57 prefix with the actual current four package manifests/locks, retaining all three CAS tests. It separately proves that the real58 checkout still refuses CAS57; production inventory checks are not relaxed. The existing54 fixture uses the same copy/run helper and retains its owning coverage.

Local Node22.23.3 qualification on disposable localhost PostgreSQL/Redis: fresh1→58, second migration no-op;54 integration tests passed (50 homework,1 actual57→58 preservation,3 isolated CAS57),0 skipped,67.135s.29 release-candidate/fixture-routing checks and6 validation checks passed; server typecheck passed. Web and tooling TypeScript checks and2 suggestion-rendering tests also passed with the locked web-ci graph. Initial front-end attempts used integration-only dependencies, then the wrong Vitest entry for node:test files; the final run used the repository Node/tsx test mechanism. The saved provider defaults to its saved working directory, so the scoped installer was invoked by its absolute worktree path. No package locks or credential settings were changed. Temporary database/cache containers and their test volumes were removed; no production database action occurred.

The current controller/executor already supports a complete57→58 maintenance plan. This second release must start from an actually accepted SDK3.8.14/native14/product57 record and bind all58 migration checksums, immutable images, exact successful CI and installed profile/probe evidence. It has no runtimePatch field. Final zero-write-loss backup and isolated restore verification remain required. A post-commit recovery must use an explicitly compatible product58 image; the old product57 image is not implicitly a rollback target. First accept the SDK14/CAS57 release, then qualify and publish this separate product58 manifest using the same scripts/release/run.sh entry. These are pending production conditions, not local-test claims of deployment.
