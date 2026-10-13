-- Product presentation only. LingxiOS remains the owner of execution and status.
CREATE TABLE agent_public_tool_activity (
  company_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES agent_run_bindings(run_id) ON DELETE CASCADE,
  tool_call_id TEXT NOT NULL CHECK (length(tool_call_id) BETWEEN 1 AND 2000),
  display JSONB NOT NULL CHECK (jsonb_typeof(display) = 'object' AND octet_length(display::text) <= 16000),
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (company_id, run_id, tool_call_id),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);
