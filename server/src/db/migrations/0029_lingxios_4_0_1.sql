-- Drain old workers before upgrading: protocol 12 adds Jev decision observations.
-- Schema is unchanged; the migration runner commits this and its version atomically.
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM lingxios.agent_work_items WHERE status='leased') THEN
    RAISE EXCEPTION 'drain workers before the LingxiOS 4.0.1 protocol upgrade';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lingxios_installation WHERE singleton
    AND ((runtime_version='3.3.4' AND protocol_version=11) OR (runtime_version='4.0.1' AND protocol_version=12))
    AND schema_version=11
    AND schema_sha256='5d77d0140de93d5c9fc205942c77b850b799d257ef49c056da2af84e15f4bb9f') THEN
    RAISE EXCEPTION 'LingxiOS 4.0.1 requires the verified 3.3.4 schema';
  END IF;
END $$;
UPDATE public.lingxios_installation SET runtime_version='4.0.1',protocol_version=12,installed_at=NOW()
WHERE singleton AND runtime_version='3.3.4';
