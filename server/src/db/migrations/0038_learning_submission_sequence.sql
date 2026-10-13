-- The runner applies this file and its version record in one transaction.
-- Preserve historical order; future versions use a monotonic sequence even if
-- the database wall clock moves backward or two submissions share a timestamp.
SET LOCAL lock_timeout = '5s';

ALTER TABLE learning_attempts ADD COLUMN submission_sequence bigint;
WITH ordered AS (
  SELECT id,ROW_NUMBER() OVER (ORDER BY submitted_at,id) AS sequence
  FROM learning_attempts
)
UPDATE learning_attempts attempt SET submission_sequence=ordered.sequence
FROM ordered WHERE ordered.id=attempt.id;

ALTER TABLE learning_attempts ALTER COLUMN submission_sequence SET NOT NULL;
ALTER TABLE learning_attempts ALTER COLUMN submission_sequence ADD GENERATED ALWAYS AS IDENTITY;
SELECT setval(pg_get_serial_sequence('learning_attempts','submission_sequence'),
  COALESCE((SELECT MAX(submission_sequence) FROM learning_attempts),1),
  EXISTS(SELECT 1 FROM learning_attempts));

CREATE INDEX learning_attempts_submission_history
  ON learning_attempts(company_id,project_id,activity_id,learner_id,submission_sequence DESC);
