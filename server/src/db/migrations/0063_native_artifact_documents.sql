-- Additive native document storage. The migration runner owns the transaction.
SET LOCAL lock_timeout = '5s';

CREATE TABLE artifact_document_state (
  artifact_id text PRIMARY KEY REFERENCES artifacts(id) ON DELETE CASCADE,
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  history_version bigint NOT NULL DEFAULT 0 CHECK (history_version >= 0),
  undo_stack jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(undo_stack) = 'array'),
  redo_stack jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(redo_stack) = 'array'),
  original_manifest jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE artifact_operations (
  artifact_id text NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  seq bigint NOT NULL CHECK (seq >= 0),
  operation_id text NOT NULL CHECK (char_length(operation_id) BETWEEN 1 AND 240),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  actor_id text NOT NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('user', 'agent')),
  kind text NOT NULL CHECK (kind IN ('edit', 'undo', 'redo', 'restore', 'convert')),
  target_operation_id text,
  operations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(operations) = 'array'),
  inverse_operations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(inverse_operations) = 'array'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, seq),
  UNIQUE (artifact_id, operation_id)
);

-- View state remains per person and is not canonical document content.
CREATE TABLE artifact_editor_contexts (
  artifact_id text NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artifact_id, user_id)
);
INSERT INTO artifact_editor_contexts(artifact_id, user_id, context, updated_at)
  SELECT artifact_id, user_id, context, updated_at FROM slide_editor_contexts;
