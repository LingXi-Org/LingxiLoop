-- Runtime-only hard-limit tail recovery; schema and protocol remain at version 11.
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lingxios_installation WHERE singleton
    AND runtime_version IN ('3.3.1','3.3.2') AND schema_version=11 AND protocol_version=11
    AND schema_sha256='5d77d0140de93d5c9fc205942c77b850b799d257ef49c056da2af84e15f4bb9f') THEN
    RAISE EXCEPTION 'LingxiOS 3.3.2 requires the verified 3.3.1 schema';
  END IF;
END $$;
UPDATE public.lingxios_installation SET runtime_version='3.3.2',installed_at=NOW()
WHERE singleton AND runtime_version='3.3.1';
