-- Additive: old deck bytes, source conversations and their messages remain untouched.
CREATE TABLE slide_workspaces (
  artifact_id text PRIMARY KEY REFERENCES artifacts(id) ON DELETE CASCADE,
  conversation_id text NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Execution may happen in the dedicated room; conversation_id remains provenance.
-- Null keeps every existing assignment bound to its original source conversation.
ALTER TABLE artifacts ADD COLUMN execution_conversation_id text REFERENCES conversations(id) ON DELETE SET NULL;
CREATE FUNCTION validate_artifact_execution_conversation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.execution_conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM conversations c WHERE c.id=NEW.execution_conversation_id
      AND c.company_id=NEW.company_id AND c.project_id=NEW.project_id
      AND (c.id=NEW.conversation_id OR EXISTS (
        SELECT 1 FROM slide_workspaces w WHERE w.artifact_id=NEW.id AND w.conversation_id=c.id
      ))
  ) THEN RAISE EXCEPTION 'invalid artifact execution conversation' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER artifact_execution_conversation_scope BEFORE INSERT OR UPDATE OF execution_conversation_id,company_id,project_id,conversation_id ON artifacts
FOR EACH ROW EXECUTE FUNCTION validate_artifact_execution_conversation();

-- The editor's transient selection belongs to the person, not to the whole room.
CREATE TABLE slide_editor_contexts (
  artifact_id text NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id,user_id)
);

-- Content-addressed checkpoints keep unchanged files once, including older formats.
CREATE TABLE artifact_file_versions (
  artifact_id text NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  sha256 text NOT NULL,
  body bytea NOT NULL,
  PRIMARY KEY (artifact_id,sha256)
);
CREATE TABLE artifact_revisions (
  artifact_id text NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  version text NOT NULL,
  files jsonb NOT NULL,
  actor_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id,seq)
);

CREATE FUNCTION validate_slide_workspace() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM artifacts a
    JOIN conversations c ON c.id=NEW.conversation_id AND c.company_id=a.company_id AND c.project_id=a.project_id
    JOIN participants p ON p.id=NEW.agent_id AND p.company_id=a.company_id AND p.kind='agent'
    WHERE a.id=NEW.artifact_id AND a.kind='slides' AND c.members ? NEW.agent_id
      AND c.id IS DISTINCT FROM a.conversation_id
  ) THEN RAISE EXCEPTION 'invalid slide workspace scope' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER slide_workspace_scope BEFORE INSERT OR UPDATE ON slide_workspaces
FOR EACH ROW EXECUTE FUNCTION validate_slide_workspace();
