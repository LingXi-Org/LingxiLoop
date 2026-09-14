-- Product associations only. Runtime tables are installed from the published package.
ALTER TABLE im_channel_bindings
  ADD COLUMN runtime_policy JSONB,
  ADD COLUMN runtime_policy_version INTEGER NOT NULL DEFAULT 0 CHECK (runtime_policy_version >= 0);

CREATE TABLE agent_run_bindings (
  run_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  thread_id TEXT,
  internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (conversation_id, company_id) REFERENCES im_channel_bindings(channel_id, company_id) ON DELETE CASCADE
);
CREATE INDEX agent_run_bindings_conversation ON agent_run_bindings(company_id, conversation_id, created_at DESC);
CREATE INDEX agent_run_bindings_session ON agent_run_bindings(company_id, session_id, agent_id, principal_id);

ALTER TABLE canvas_agent_runs ADD COLUMN graph_id TEXT, ADD COLUMN parent_work_id TEXT;
ALTER TABLE canvases ADD COLUMN shared_state_thread_key TEXT;
