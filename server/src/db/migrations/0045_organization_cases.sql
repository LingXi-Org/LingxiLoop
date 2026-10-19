-- The migration runner wraps this entire asset in one transaction.
SET LOCAL lock_timeout = '5s';
CREATE TABLE organization_cases (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  draft jsonb NOT NULL CHECK (jsonb_typeof(draft)='object'),
  published jsonb CHECK (jsonb_typeof(published)='object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','unpublished')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  published_version integer,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  published_at timestamptz,
  UNIQUE (id,company_id),
  CHECK (status<>'published' OR (published IS NOT NULL AND published_version IS NOT NULL AND source_id IS NOT NULL))
);
CREATE INDEX organization_cases_company ON organization_cases(company_id,updated_at DESC);
CREATE TABLE organization_case_images (
  storage_key text PRIMARY KEY,
  case_id text NOT NULL,
  company_id text NOT NULL,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  FOREIGN KEY(case_id,company_id) REFERENCES organization_cases(id,company_id) ON DELETE CASCADE
);
CREATE TABLE organization_case_notebooks (
  company_id text PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  external_notebook_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE knowledge_sources ADD COLUMN case_id text, ADD COLUMN case_version integer;
ALTER TABLE knowledge_sources ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE knowledge_sources DROP CONSTRAINT knowledge_sources_visibility_scope_check;
ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_visibility_scope_check
  CHECK (visibility_scope IN ('PRIVATE','PROJECT','COMPANY_CASE'));
ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_case_scope_check CHECK (
  (case_id IS NULL AND case_version IS NULL AND project_id IS NOT NULL AND visibility_scope IN ('PRIVATE','PROJECT')) OR
  (case_id IS NOT NULL AND case_version IS NOT NULL AND case_version>0 AND project_id IS NULL AND conversation_id IS NULL AND visibility_scope='COMPANY_CASE')
);
ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_case_company_fk
 FOREIGN KEY(case_id,company_id) REFERENCES organization_cases(id,company_id) ON DELETE CASCADE;
CREATE UNIQUE INDEX knowledge_sources_case_version ON knowledge_sources(case_id,case_version) WHERE case_id IS NOT NULL;
ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_case_identity UNIQUE(id,case_id,company_id);
ALTER TABLE organization_cases ADD CONSTRAINT organization_cases_source_fk FOREIGN KEY(source_id,id,company_id) REFERENCES knowledge_sources(id,case_id,company_id) ON DELETE RESTRICT;
