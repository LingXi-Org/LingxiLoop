-- The migration runner wraps this additive migration in one transaction.
-- Legacy im_ui_* rows deliberately remain available for retention/operations.
SET LOCAL lock_timeout = '5s';
CREATE TABLE im_visualize_documents (
  company_id text NOT NULL,
  channel_id text NOT NULL,
  path text NOT NULL,
  run_id text NOT NULL REFERENCES agent_run_bindings(run_id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  created_by text NOT NULL,
  html text NOT NULL CHECK (octet_length(html) <= 5000000),
  source_hash text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(company_id,channel_id,path),
  FOREIGN KEY(channel_id,company_id) REFERENCES im_channel_bindings(channel_id,company_id) ON DELETE CASCADE,
  FOREIGN KEY(agent_id,company_id) REFERENCES participants(id,company_id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,created_by) REFERENCES company_memberships(company_id,user_id) ON DELETE CASCADE
);
CREATE TABLE im_visualize_states (
  company_id text NOT NULL, channel_id text NOT NULL, path text NOT NULL, user_id text NOT NULL,
  state jsonb NOT NULL CHECK (jsonb_typeof(state)='object' AND octet_length(state::text)<=32768),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(company_id,channel_id,path,user_id),
  FOREIGN KEY(company_id,channel_id,path) REFERENCES im_visualize_documents(company_id,channel_id,path) ON DELETE CASCADE,
  FOREIGN KEY(company_id,user_id) REFERENCES company_memberships(company_id,user_id) ON DELETE CASCADE
);
CREATE TABLE im_visualize_pages (
  id text PRIMARY KEY, company_id text NOT NULL, channel_id text NOT NULL, path text NOT NULL, user_id text NOT NULL,
  project_id text, token_hash text NOT NULL, instance_key text NOT NULL, document_version integer NOT NULL,
  source_message_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(), expires_at timestamptz NOT NULL DEFAULT NOW()+INTERVAL '24 hours',
  revoked_at timestamptz,
  FOREIGN KEY(company_id,channel_id,path) REFERENCES im_visualize_documents(company_id,channel_id,path) ON DELETE CASCADE,
  FOREIGN KEY(company_id,user_id) REFERENCES company_memberships(company_id,user_id) ON DELETE CASCADE
);
CREATE INDEX im_visualize_pages_owner ON im_visualize_pages(company_id,user_id) WHERE revoked_at IS NULL;
CREATE TABLE im_visualize_gestures (
  token_hash text PRIMARY KEY, page_id text NOT NULL REFERENCES im_visualize_pages(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT NOW()+INTERVAL '5 seconds', consumed_at timestamptz
);
