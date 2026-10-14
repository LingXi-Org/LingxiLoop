-- The migration runner commits this file and its migration record atomically.
SET LOCAL lock_timeout = '5s';

CREATE TABLE homeworks (
  id text PRIMARY KEY, company_id text NOT NULL, project_id text NOT NULL, course_id text NOT NULL,
  created_by text NOT NULL REFERENCES users(id), status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','CLOSED')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0), title text NOT NULL, instructions text NOT NULL,
  criteria jsonb NOT NULL CHECK (jsonb_typeof(criteria)='array' AND jsonb_array_length(criteria) BETWEEN 1 AND 20),
  links jsonb NOT NULL DEFAULT '[]', attachments jsonb NOT NULL DEFAULT '[]', due_at timestamptz,
  visible_hash text NOT NULL, validated_revision integer, validation_status text NOT NULL DEFAULT 'PENDING' CHECK (validation_status IN ('PENDING','READY','INVALID')),
  validation_feedback text NOT NULL DEFAULT '', materials jsonb NOT NULL DEFAULT '[]', publish_key text,
  published_at timestamptz, created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,id), UNIQUE(company_id,project_id,id),
  FOREIGN KEY(project_id,company_id) REFERENCES projects(id,company_id) ON DELETE CASCADE,
  FOREIGN KEY(course_id,company_id) REFERENCES courses(id,company_id) ON DELETE CASCADE
);
CREATE INDEX homeworks_feed ON homeworks(company_id,project_id,published_at DESC) WHERE status<>'DRAFT';
CREATE INDEX homeworks_files ON homeworks USING gin(attachments jsonb_path_ops);

CREATE TABLE homework_learner_state (
  company_id text NOT NULL, project_id text NOT NULL, homework_id text NOT NULL, learner_id text NOT NULL REFERENCES users(id),
  agent_id text, channel_id text, answer jsonb NOT NULL DEFAULT '{"text":"","links":[],"attachments":[]}',
  answer_revision integer NOT NULL DEFAULT 0 CHECK (answer_revision>=0), evidence_revision integer NOT NULL DEFAULT 0 CHECK (evidence_revision>=0),
  assessment_id text, report jsonb, report_status text NOT NULL DEFAULT 'NONE' CHECK (report_status IN ('NONE','PENDING','READY','INVALID')),
  report_feedback text NOT NULL DEFAULT '',
  latest_submission_id text, return_epoch integer NOT NULL DEFAULT 0 CHECK (return_epoch>=0), returned_at timestamptz,
  returned_after_sequence bigint NOT NULL DEFAULT 0 CHECK (returned_after_sequence>=0),
  manual_evidence jsonb, manual_unlock jsonb, updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY(company_id,homework_id,learner_id),
  FOREIGN KEY(company_id,project_id,homework_id) REFERENCES homeworks(company_id,project_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX homework_private_channel ON homework_learner_state(channel_id) WHERE channel_id IS NOT NULL;

CREATE TABLE homework_assessments (
  id text PRIMARY KEY, company_id text NOT NULL, homework_id text NOT NULL, learner_id text NOT NULL,
  evidence_revision integer NOT NULL, return_epoch integer NOT NULL, message_ids jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY','INVALID')),
  result jsonb, evidence jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,homework_id,learner_id,evidence_revision),
  FOREIGN KEY(company_id,homework_id,learner_id) REFERENCES homework_learner_state(company_id,homework_id,learner_id) ON DELETE CASCADE
);

CREATE TABLE homework_submissions (
  id text PRIMARY KEY, company_id text NOT NULL, project_id text NOT NULL, homework_id text NOT NULL, learner_id text NOT NULL,
  version integer NOT NULL CHECK (version>0), idempotency_key text NOT NULL, content_hash text NOT NULL,
  answer jsonb NOT NULL, report jsonb NOT NULL, answer_revision integer NOT NULL, return_epoch integer NOT NULL,
  late boolean NOT NULL, submitted_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,homework_id,learner_id,version), UNIQUE(company_id,homework_id,learner_id,idempotency_key),
  FOREIGN KEY(company_id,homework_id,learner_id) REFERENCES homework_learner_state(company_id,homework_id,learner_id) ON DELETE CASCADE
);
CREATE INDEX homework_submission_files ON homework_submissions USING gin((answer->'attachments') jsonb_path_ops);

CREATE TABLE homework_teacher_decisions (
  id text PRIMARY KEY, company_id text NOT NULL, homework_id text NOT NULL, learner_id text NOT NULL,
  submission_id text REFERENCES homework_submissions(id), teacher_id text NOT NULL REFERENCES users(id),
  decision text NOT NULL CHECK (decision IN ('PASSED','RETURNED','UNLOCKED')), reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 4000),
  evidence_revision integer NOT NULL, return_epoch integer NOT NULL, created_at timestamptz NOT NULL DEFAULT NOW(),
  FOREIGN KEY(company_id,homework_id,learner_id) REFERENCES homework_learner_state(company_id,homework_id,learner_id) ON DELETE CASCADE,
  CHECK ((decision='UNLOCKED')=(submission_id IS NULL))
);
CREATE INDEX homework_decisions_latest ON homework_teacher_decisions(company_id,homework_id,learner_id,created_at DESC,id DESC);

ALTER TABLE context_threads DROP CONSTRAINT context_threads_context_type_check;
ALTER TABLE context_threads ADD CONSTRAINT context_threads_context_type_check CHECK (context_type IN ('LEARNING','TEACHER_TAKEOVER','INTERVENTION','CASE_DISCUSSION','TEACHER_OPERATIONS','HOMEWORK'));
ALTER TABLE course_forum_comments DROP CONSTRAINT course_forum_comments_target_type_check;
ALTER TABLE course_forum_comments ADD CONSTRAINT course_forum_comments_target_type_check CHECK (target_type IN ('post','homework'));
ALTER TABLE course_forum_flags ADD COLUMN archived boolean NOT NULL DEFAULT FALSE;
ALTER TABLE course_forum_flags DROP CONSTRAINT course_forum_flags_target_type_check;
ALTER TABLE course_forum_flags ADD CONSTRAINT course_forum_flags_target_type_check CHECK (target_type IN ('post','homework'));
ALTER TABLE learning_effects DROP CONSTRAINT learning_effects_kind_check;
ALTER TABLE learning_effects ADD CONSTRAINT learning_effects_kind_check CHECK (kind IN (
  'study_room.sync','teacher_room.sync','teacher_agent.welcome','notebook.ensure','course_metadata.sync','course_archive.sync',
  'member_access.revoke','member_onboarding.seed','homework.validate','homework.assess','homework.report'));

-- Upgrade the system-managed teacher persona while preserving native memory permissions.
UPDATE participants AS agent
SET system_prompt='You assist teachers with course forum assignments, referenced materials and submission feedback. Preserve teacher-room privacy. Use authorized knowledge reads for references. Do not create or manage courses, objectives, learning activities, missions or independent cases. Never contact students or expose private submissions. Use authorized internal memory for durable preferences; current course facts remain authoritative. Help the teacher establish clear tasks and a few independent mastery criteria, then use teacher.draft_homework. The initiating teacher must review and explicitly publish the latest editable draft card. Use teacher.homework_overview for submitted homework summaries and evidence. You cannot publish, submit, pass, return or manually unlock homework.'
FROM learning_project_teacher_agents AS teacher
WHERE teacher.company_id=agent.company_id AND teacher.agent_id=agent.id
  AND agent.kind='agent' AND teacher.preset_version<6;
UPDATE learning_project_teacher_agents SET preset_version=6,updated_at=NOW() WHERE preset_version<6;
