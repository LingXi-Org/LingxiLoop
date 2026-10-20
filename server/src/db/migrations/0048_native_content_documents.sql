-- #219: additive native editor state. Original text, history and authorization are unchanged.
-- 0047 is reserved for #216; release integrator applies both in order.
-- The migration runner owns the single transaction, including its ledger row.
SET LOCAL lock_timeout = '5s';
ALTER TABLE course_forum_posts ADD COLUMN IF NOT EXISTS editor_document jsonb;
ALTER TABLE course_forum_comments ADD COLUMN IF NOT EXISTS editor_document jsonb;
ALTER TABLE course_forum_submissions ADD COLUMN IF NOT EXISTS editor_document jsonb;
ALTER TABLE course_forum_feedback ADD COLUMN IF NOT EXISTS editor_document jsonb;
ALTER TABLE course_forum_feedback ADD COLUMN IF NOT EXISTS attachments jsonb;
ALTER TABLE course_forum_feedback ADD COLUMN IF NOT EXISTS links jsonb;
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS editor_document jsonb;
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS criteria_document jsonb;
ALTER TABLE homework_teacher_decisions ADD COLUMN IF NOT EXISTS editor_document jsonb;
ALTER TABLE homework_teacher_decisions ADD COLUMN IF NOT EXISTS attachments jsonb;
ALTER TABLE homework_teacher_decisions ADD COLUMN IF NOT EXISTS links jsonb;
