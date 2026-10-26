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
