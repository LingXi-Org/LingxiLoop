-- The migration runner owns the transaction.
CREATE TABLE im_questionnaires (
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  channel_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  run_id text NOT NULL,
  request_version integer NOT NULL CHECK (request_version > 0),
  agent_id text NOT NULL,
  principal_id text NOT NULL REFERENCES users(id),
  session_id text NOT NULL,
  thread_id text,
  payload jsonb NOT NULL,
  delivered_at timestamptz,
  answers jsonb,
  submission_nonce text,
  submission_payload jsonb,
  submitted_at timestamptz,
  submission_attempts integer NOT NULL DEFAULT 0,
  submission_claim_token text,
  submission_retry_at timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY(company_id,channel_id,question_id),
  FOREIGN KEY(agent_id,company_id) REFERENCES participants(id,company_id),
  FOREIGN KEY(channel_id,company_id) REFERENCES im_channel_bindings(channel_id,company_id) ON DELETE CASCADE,
  UNIQUE(company_id,run_id,request_version),
  CHECK ((answers IS NULL AND submission_nonce IS NULL AND submission_payload IS NULL AND submitted_at IS NULL)
    OR (answers IS NOT NULL AND submission_nonce IS NOT NULL AND submission_payload IS NOT NULL)),
  CHECK (submitted_at IS NULL OR delivered_at IS NOT NULL)
);
CREATE INDEX im_questionnaires_pending_submission ON im_questionnaires(submission_retry_at)
  WHERE answers IS NOT NULL AND submitted_at IS NULL;
