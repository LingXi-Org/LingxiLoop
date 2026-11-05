-- Additive, transaction and lock timeout owned by the migration runner.
CREATE TABLE organization_case_options (
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('category','college')),
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id,kind,name)
);

-- Only already public categories become shared choices; drafts stay private.
INSERT INTO organization_case_options(company_id,kind,name)
SELECT DISTINCT company_id,'category',btrim(published->>'category')
FROM organization_cases
WHERE deleted_at IS NULL AND published IS NOT NULL
  AND char_length(btrim(published->>'category')) BETWEEN 1 AND 80;
