-- The migration runner owns the transaction. Design and Slides artifacts (ported from
-- JimLiu/baoyu-design claude-design and claude-slides) replace the retired Canvas; the
-- Canvas tables and their history are retired by their own migration.
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION public.enforce_artifact_conversation_owner() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.conversation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM conversations c
    WHERE c.id = NEW.conversation_id AND c.company_id = NEW.company_id AND c.project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'artifact conversation must belong to the same company and project';
  END IF;
  RETURN NEW;
END;
$$;

-- One editable artifact in the upstream file format plus its collaboration workspace.
CREATE TABLE artifacts (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  conversation_id text REFERENCES conversations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('design','slides')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  seq bigint NOT NULL DEFAULT 0 CHECK (seq >= 0),
  created_by text NOT NULL,
  authorization_user_id text,
  trigger_client_msg_no text,
  goal text NOT NULL DEFAULT '',
  initiator_agent_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','summarizing','completed','stopped','failed')),
  origin text NOT NULL CHECK (origin IN ('user','conversation','agent_os')),
  summary text,
  shared_state_thread_key text,
  progress_version integer NOT NULL DEFAULT 0,
  progress_snapshot jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (id, company_id),
  CHECK (kind <> 'design' OR conversation_id IS NOT NULL)
);
CREATE UNIQUE INDEX artifacts_one_design_per_conversation ON artifacts(conversation_id) WHERE kind = 'design';
CREATE INDEX artifacts_project ON artifacts(company_id, project_id, kind, updated_at DESC);
CREATE INDEX artifacts_conversation ON artifacts(company_id, conversation_id, updated_at DESC) WHERE conversation_id IS NOT NULL;
CREATE TRIGGER trg_artifact_conversation_owner BEFORE INSERT OR UPDATE OF conversation_id, project_id ON artifacts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_artifact_conversation_owner();
CREATE TRIGGER trg_touch_workspace AFTER INSERT OR DELETE OR UPDATE ON artifacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_knowledge_workspace_updated_at();

-- The `project/` files of the upstream Store; a publish replaces rows in one transaction.
CREATE TABLE artifact_files (
  artifact_id text NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  path text NOT NULL CHECK (path ~ '^project/[^\\]+$' AND path !~ '(^|/)\.\.?(/|$)'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size integer NOT NULL CHECK (size >= 0),
  content_type text NOT NULL,
  body bytea NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (artifact_id, path)
);

-- Uploads addressed by content; bytes live in object storage.
CREATE TABLE artifact_blobs (
  artifact_id text NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (id ~ '^[0-9a-f]{32}$'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size bigint NOT NULL CHECK (size > 0),
  content_type text NOT NULL,
  storage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (artifact_id, id)
);
CREATE UNIQUE INDEX artifact_blobs_id ON artifact_blobs(id);

-- The upstream comments.json document, one per artifact.
CREATE TABLE artifact_comments (
  artifact_id text PRIMARY KEY REFERENCES artifacts(id) ON DELETE CASCADE,
  doc jsonb NOT NULL CHECK (jsonb_typeof(doc) = 'object' AND doc->>'version' = '1' AND jsonb_typeof(doc->'threads') = 'array'),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE artifact_activity (
  id text PRIMARY KEY,
  artifact_id text NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  path text,
  actor_id text NOT NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('user','agent')),
  action text NOT NULL CHECK (action IN ('workspace_started','workspace_updated','files_published','comment_created',
    'assignment_created','assignment_updated','handoff','task_completed','task_failed','task_cancelled')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX artifact_activity_artifact ON artifact_activity(artifact_id, created_at DESC);

CREATE TABLE artifact_agent_assignments (
  id text PRIMARY KEY,
  artifact_id text NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  assignment text NOT NULL,
  color text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','blocked','working','waiting','completed','failed','cancelled')),
  execution_role text NOT NULL DEFAULT 'specialist' CHECK (execution_role IN ('specialist','verifier')),
  verifies_assignment_id text REFERENCES artifact_agent_assignments(id) ON DELETE SET NULL,
  active_path text,
  work_id text,
  request_client_msg_no text,
  result text,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (artifact_id, agent_id),
  UNIQUE (id, artifact_id),
  CHECK (verifies_assignment_id IS NULL OR verifies_assignment_id <> id)
);
CREATE INDEX artifact_assignments_status ON artifact_agent_assignments(artifact_id, status, created_at);

CREATE TABLE artifact_assignment_dependencies (
  assignment_id text NOT NULL REFERENCES artifact_agent_assignments(id) ON DELETE CASCADE,
  depends_on_assignment_id text NOT NULL REFERENCES artifact_agent_assignments(id) ON DELETE CASCADE,
  PRIMARY KEY (assignment_id, depends_on_assignment_id),
  CHECK (assignment_id <> depends_on_assignment_id)
);

CREATE TABLE artifact_agent_runs (
  work_id text NOT NULL,
  company_id text NOT NULL,
  artifact_id text NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  assignment_id text REFERENCES artifact_agent_assignments(id) ON DELETE SET NULL,
  agent_id text NOT NULL,
  principal_id text NOT NULL,
  session_id text NOT NULL,
  thread_id text,
  request_version integer NOT NULL CHECK (request_version > 0),
  execution_role text NOT NULL CHECK (execution_role IN ('specialist','verifier','reporter')),
  graph_id text,
  parent_work_id text,
  PRIMARY KEY (work_id, artifact_id)
);
CREATE INDEX artifact_agent_runs_artifact ON artifact_agent_runs(artifact_id);

CREATE TABLE artifact_assignment_reports (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  artifact_id text NOT NULL,
  assignment_id text,
  author_agent_id text NOT NULL,
  execution_role text NOT NULL CHECK (execution_role IN ('specialist','verifier','reporter')),
  schema_version text NOT NULL DEFAULT 'learning_report_v1' CHECK (schema_version = 'learning_report_v1'),
  finding text NOT NULL,
  evidence_id text NOT NULL,
  source_evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(source_evidence_ids) = 'array' AND jsonb_array_length(source_evidence_ids) <= 64),
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  unresolved jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_step text,
  verifies_report_id text REFERENCES artifact_assignment_reports(id) ON DELETE SET NULL,
  disconfirming_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  verdict text CHECK (verdict IS NULL OR verdict IN ('supported','rejected','inconclusive')),
  consumed_report_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  conflict_resolution jsonb NOT NULL DEFAULT '[]'::jsonb,
  work_id text,
  request_version integer,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  FOREIGN KEY (artifact_id, company_id) REFERENCES artifacts(id, company_id) ON DELETE CASCADE,
  FOREIGN KEY (assignment_id, artifact_id) REFERENCES artifact_agent_assignments(id, artifact_id) ON DELETE CASCADE,
  FOREIGN KEY (author_agent_id, company_id) REFERENCES participants(id, company_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX artifact_report_assignment ON artifact_assignment_reports(assignment_id) WHERE assignment_id IS NOT NULL;
CREATE INDEX artifact_reports_artifact ON artifact_assignment_reports(company_id, artifact_id, created_at);
CREATE INDEX agent_native_artifact_request ON agent_native_event_outbox(company_id, work_id) WHERE event->>'type' = 'im.user';

-- The Canvas capability becomes Design and Slides; revocations stay revoked.
ALTER TABLE participants ALTER COLUMN capabilities
  SET DEFAULT '["design","slides","web","files","documents","knowledge","learning","routines"]'::jsonb;
UPDATE participants SET capabilities = (capabilities - 'canvas') || '["design","slides"]'::jsonb
WHERE kind = 'agent' AND capabilities ? 'canvas';

-- Exact preset wording only; custom prompts are preserved.
UPDATE participants SET system_prompt = replace(replace(replace(replace(system_prompt,
    'Return a structured specialist report when working in Canvas.', 'Return a structured specialist report when working in a shared Design or Slides artifact.'),
    'produce a structured Canvas report.', 'produce a structured artifact report.'),
    'Use Canvas for shared artifacts;', 'Use Design or Slides for shared artifacts;'),
    'For a shared deliverable or independent verification, use the Canvas workflow.', 'For a shared deliverable or independent verification, use the Design or Slides workflow.')
WHERE kind = 'agent' AND preset_key IN ('nova','sage','milo','trace','scout','forge');
