-- The canonical lesson remains in WuKongIM; these rows only index publication and personal state.
CREATE TABLE im_ui_revisions (
  company_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  ui_id TEXT NOT NULL CHECK (length(ui_id) BETWEEN 1 AND 200),
  revision INTEGER NOT NULL CHECK (revision > 0),
  base_revision INTEGER NOT NULL CHECK (base_revision >= 0 AND revision = base_revision + 1),
  native_message_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES agent_run_bindings(run_id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  result_id TEXT NOT NULL,
  fence BIGINT NOT NULL CHECK (fence >= 0),
  client_nonce TEXT NOT NULL,
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'committed', 'superseded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  committed_at TIMESTAMPTZ,
  PRIMARY KEY (company_id, channel_id, ui_id, revision),
  FOREIGN KEY (channel_id, company_id) REFERENCES im_channel_bindings(channel_id, company_id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id, company_id) REFERENCES participants(id, company_id) ON DELETE CASCADE,
  CHECK ((status = 'pending' AND message_id IS NULL AND committed_at IS NULL)
    OR (status <> 'pending' AND message_id IS NOT NULL AND committed_at IS NOT NULL))
);
CREATE UNIQUE INDEX im_ui_revisions_pending ON im_ui_revisions(company_id, channel_id, ui_id) WHERE status = 'pending';
CREATE UNIQUE INDEX im_ui_revisions_current ON im_ui_revisions(company_id, channel_id, ui_id) WHERE status = 'committed';
CREATE INDEX im_ui_revisions_delivery ON im_ui_revisions(company_id, channel_id, client_nonce);

CREATE TABLE im_ui_user_states (
  company_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  ui_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  state JSONB NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  version INTEGER NOT NULL CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, channel_id, ui_id, user_id),
  FOREIGN KEY (company_id, channel_id, ui_id, revision)
    REFERENCES im_ui_revisions(company_id, channel_id, ui_id, revision) ON DELETE CASCADE,
  FOREIGN KEY (company_id, user_id) REFERENCES company_memberships(company_id, user_id) ON DELETE CASCADE
);
