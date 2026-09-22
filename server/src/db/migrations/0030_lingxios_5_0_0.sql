-- Protocol 13 introduces Worker-prepared, source-bound tool decisions. No schema rewrite.
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM lingxios.agent_work_items WHERE status='leased') THEN
    RAISE EXCEPTION 'drain workers before the LingxiOS 5 decision protocol upgrade';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lingxios_installation WHERE singleton
    AND runtime_version='4.0.1' AND protocol_version=12 AND schema_version=11
    AND schema_sha256='5d77d0140de93d5c9fc205942c77b850b799d257ef49c056da2af84e15f4bb9f') THEN
    RAISE EXCEPTION 'LingxiOS 5 requires the verified 4.0.1 installation';
  END IF;
END $$;
UPDATE public.lingxios_installation SET runtime_version='5.0.0-rc.2',protocol_version=13,installed_at=NOW() WHERE singleton;
