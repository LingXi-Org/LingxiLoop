-- The migration runner applies this file and its version record in one transaction.
-- Existing text-only comments remain readable by old and new application versions.
SET LOCAL lock_timeout = '5s';

ALTER TABLE course_forum_comments
  ADD COLUMN links jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(links)='array' AND jsonb_array_length(links)<=20),
  ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(attachments)='array' AND jsonb_array_length(attachments)<=20),
  DROP CONSTRAINT course_forum_comments_body_check,
  ADD CONSTRAINT course_forum_comments_content_check CHECK (
    char_length(body)<=10000 AND (char_length(body)>0 OR jsonb_array_length(links)>0 OR jsonb_array_length(attachments)>0));

CREATE INDEX course_forum_comments_files ON course_forum_comments USING gin(attachments jsonb_path_ops);
