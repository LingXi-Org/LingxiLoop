-- Forward-only, transactional (the migration runner owns the transaction).
-- Historical submissions deliberately keep empty references and no assessment.
ALTER TABLE course_forum_submissions ADD COLUMN conversation_references jsonb NOT NULL DEFAULT '[]'
  CHECK (jsonb_typeof(conversation_references)='array');
ALTER TABLE course_forum_submissions ADD COLUMN assessment jsonb;
ALTER TABLE homework_submissions ADD COLUMN conversation_references jsonb NOT NULL DEFAULT '[]'
  CHECK (jsonb_typeof(conversation_references)='array');
ALTER TABLE learning_effects DROP CONSTRAINT learning_effects_kind_check;
ALTER TABLE learning_effects ADD CONSTRAINT learning_effects_kind_check CHECK (kind IN (
  'study_room.sync','teacher_room.sync','teacher_agent.welcome','notebook.ensure','course_metadata.sync','course_archive.sync',
  'member_access.revoke','member_onboarding.seed','homework.validate','homework.assess','homework.report','forum.assess'));
