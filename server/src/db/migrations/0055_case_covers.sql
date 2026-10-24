-- The migration runner owns the transaction; existing article snapshots stay intact.
SET LOCAL lock_timeout = '5s';
CREATE TABLE organization_case_cover_jobs (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  case_id text NOT NULL,
  fingerprint text NOT NULL,
  rules_version text NOT NULL,
  generation integer NOT NULL DEFAULT 1 CHECK (generation > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  requested_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','ready','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT NOW(),
  lease_token text,
  leased_until timestamptz,
  failure_category text,
  duration_ms integer,
  retry_key text,
  retry_expected_generation integer,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (company_id,case_id,fingerprint,rules_version),
  UNIQUE (id,case_id,company_id),
  FOREIGN KEY (case_id,company_id) REFERENCES organization_cases(id,company_id) ON DELETE CASCADE,
  CHECK ((status='generating') = (lease_token IS NOT NULL AND leased_until IS NOT NULL))
);
CREATE INDEX organization_case_cover_jobs_claim ON organization_case_cover_jobs(available_at,created_at) WHERE status IN ('pending','generating');
CREATE TABLE organization_case_cover_assets (
  job_id text NOT NULL,
  generation integer NOT NULL CHECK (generation > 0),
  case_id text NOT NULL,
  company_id text NOT NULL,
  preview_svg text NOT NULL CHECK (octet_length(preview_svg)<=524288),
  interactive_html text NOT NULL CHECK (octet_length(interactive_html)<=2097152),
  alt text NOT NULL CHECK (length(alt)<=1000),
  object_name text NOT NULL,
  rationale text NOT NULL,
  source_version text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (job_id,generation),
  UNIQUE (job_id,generation,case_id,company_id),
  FOREIGN KEY (job_id,case_id,company_id) REFERENCES organization_case_cover_jobs(id,case_id,company_id) ON DELETE CASCADE
);
CREATE TABLE organization_case_cover_targets (
  case_id text NOT NULL,
  company_id text NOT NULL,
  snapshot_kind text NOT NULL CHECK (snapshot_kind IN ('draft','published')),
  job_id text NOT NULL,
  asset_job_id text,
  asset_generation integer,
  PRIMARY KEY (case_id,snapshot_kind),
  FOREIGN KEY (case_id,company_id) REFERENCES organization_cases(id,company_id) ON DELETE CASCADE,
  FOREIGN KEY (job_id,case_id,company_id) REFERENCES organization_case_cover_jobs(id,case_id,company_id) ON DELETE CASCADE,
  FOREIGN KEY (asset_job_id,asset_generation,case_id,company_id) REFERENCES organization_case_cover_assets(job_id,generation,case_id,company_id) ON DELETE RESTRICT,
  CHECK ((asset_job_id IS NULL) = (asset_generation IS NULL))
);
