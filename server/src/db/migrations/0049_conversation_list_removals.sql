-- Personal, reversible list removal only; shared history and membership survive.
-- The migration runner owns the transaction and its schema ledger row.
SET LOCAL lock_timeout = '5s';

CREATE TABLE conversation_list_removals (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id text NOT NULL,
  company_id text NOT NULL,
  project_id text NOT NULL,
  removed_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, conversation_id),
  FOREIGN KEY (conversation_id, company_id, project_id)
    REFERENCES conversations(id, company_id, project_id) ON DELETE CASCADE
);
