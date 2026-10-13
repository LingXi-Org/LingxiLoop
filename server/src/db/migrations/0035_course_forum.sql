-- The migration runner commits this file and its schema_migrations record atomically.
-- Existing activities, sources and attempts remain the canonical records; no content is copied.
SET LOCAL lock_timeout = '5s';

CREATE TABLE course_forum_posts (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  project_id text NOT NULL,
  author_user_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('share','resource','case')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body text NOT NULL CHECK (char_length(body) <= 20000),
  tags text[] NOT NULL DEFAULT '{}',
  links jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(links)='array'),
  attachments jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(attachments)='array'),
  source_id text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (company_id,project_id,id),
  FOREIGN KEY (project_id,company_id) REFERENCES projects(id,company_id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id),
  FOREIGN KEY (source_id,company_id) REFERENCES knowledge_sources(id,company_id)
);
CREATE INDEX course_forum_posts_feed ON course_forum_posts(company_id,project_id,created_at DESC,id);
CREATE INDEX course_forum_posts_files ON course_forum_posts USING gin(attachments jsonb_path_ops);
CREATE INDEX learning_evidence_submission_files ON evidence_records USING gin((data->'attachments') jsonb_path_ops);

-- Targets are existing activities, sources or posts. Their current visibility is checked
-- on every read/write, so a resource made private also hides its discussion and flags.
CREATE TABLE course_forum_comments (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  project_id text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('post','activity','source')),
  target_id text NOT NULL,
  author_user_id text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  FOREIGN KEY (project_id,company_id) REFERENCES projects(id,company_id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id)
);
CREATE INDEX course_forum_comments_thread ON course_forum_comments(company_id,project_id,target_type,target_id,created_at,id);

CREATE TABLE course_forum_flags (
  company_id text NOT NULL,
  project_id text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('post','activity','source')),
  target_id text NOT NULL,
  pinned boolean NOT NULL DEFAULT FALSE,
  official boolean NOT NULL DEFAULT FALSE,
  featured boolean NOT NULL DEFAULT FALSE,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id,project_id,target_type,target_id),
  FOREIGN KEY (project_id,company_id) REFERENCES projects(id,company_id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

ALTER TABLE learning_attempts
  ADD COLUMN source text NOT NULL DEFAULT 'STUDENT_ORIGINAL'
    CHECK (source IN ('STUDENT_ORIGINAL','AGENT_RELAY','AGENT_GENERATED')),
  ADD COLUMN submitted_by_agent text,
  ADD COLUMN agent_work_id text,
  ADD COLUMN late boolean NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT learning_attempt_source_actor CHECK (
    (source='STUDENT_ORIGINAL' AND submitted_by_agent IS NULL AND agent_work_id IS NULL)
    OR (source IN ('AGENT_RELAY','AGENT_GENERATED') AND submitted_by_agent IS NOT NULL AND agent_work_id IS NOT NULL)),
  ADD CONSTRAINT learning_attempt_generated_assistance CHECK (source<>'AGENT_GENERATED' OR assistance='GUIDED');

-- Legacy submissions already retain their timestamp and activity deadline.
UPDATE learning_attempts attempt SET late=activity.due_at IS NOT NULL AND attempt.submitted_at>activity.due_at
FROM learning_activities activity WHERE activity.company_id=attempt.company_id
  AND activity.project_id=attempt.project_id AND activity.id=attempt.activity_id;
